#!/usr/bin/env python3
import argparse
import json
import math
import tempfile
from pathlib import Path
from zipfile import ZipFile

import laspy
import numpy as np
from pyproj import Transformer
from scipy.interpolate import LinearNDInterpolator
from scipy.spatial import Delaunay
from shapely import contains_xy
from shapely.geometry import LineString, Polygon, mapping, shape
from shapely.ops import transform

EXPECTED_EPSG = 31983
ANALYSIS_VERSION = "terrain-mdt-2020-surface-v2"
GRID_RESOLUTION_M = 1.0
CONTEXT_BUFFER_M = 8.0
CONTOUR_INTERVALS_M = (0.5, 1.0, 2.0, 5.0)
SLOPE_BANDS = (
    (0.0, 5.0, "0–5%"),
    (5.0, 15.0, "5–15%"),
    (15.0, 30.0, "15–30%"),
    (30.0, None, "≥30%"),
)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lot-geometry-json", required=True)
    parser.add_argument("--zip", action="append", dest="zip_specs", default=[])
    return parser.parse_args()


def compass_label(degrees):
    labels = [
        "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
    ]
    return labels[int((degrees + 11.25) // 22.5) % 16]


def vertical_datum(header):
    for vlr in header.vlrs:
        if getattr(vlr, "user_id", "") == "VertDatum-Geoid":
            description = getattr(vlr, "description", None)
            if description:
                return str(description)
    return None


def round_or_none(value, digits=3):
    if value is None or not np.isfinite(value):
        return None
    return round(float(value), digits)


def line_parts(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == "LineString":
        return [geometry]
    if geometry.geom_type == "MultiLineString":
        return list(geometry.geoms)
    if geometry.geom_type == "GeometryCollection":
        result = []
        for item in geometry.geoms:
            result.extend(line_parts(item))
        return result
    return []


def unique_intersections(points, tolerance=1e-8):
    result = []
    for point in points:
        if not any(
            abs(point[0] - existing[0]) <= tolerance
            and abs(point[1] - existing[1]) <= tolerance
            for existing in result
        ):
            result.append(point)
    return result


def triangle_contour_segment(vertices, values, level):
    intersections = []
    for left, right in ((0, 1), (1, 2), (2, 0)):
        x1, y1 = vertices[left]
        x2, y2 = vertices[right]
        z1 = float(values[left])
        z2 = float(values[right])

        if math.isclose(z1, z2, abs_tol=1e-12):
            if math.isclose(z1, level, abs_tol=1e-9):
                intersections.extend([(x1, y1), (x2, y2)])
            continue

        if (level < min(z1, z2)) or (level > max(z1, z2)):
            continue
        ratio = (level - z1) / (z2 - z1)
        if -1e-10 <= ratio <= 1.0 + 1e-10:
            ratio = min(max(ratio, 0.0), 1.0)
            intersections.append(
                (x1 + ratio * (x2 - x1), y1 + ratio * (y2 - y1))
            )

    intersections = unique_intersections(intersections)
    if len(intersections) < 2:
        return None
    if len(intersections) == 2:
        return intersections

    best_pair = None
    best_distance = -1.0
    for i, left in enumerate(intersections):
        for right in intersections[i + 1 :]:
            distance = (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2
            if distance > best_distance:
                best_distance = distance
                best_pair = [left, right]
    return best_pair


def build_contours(grid_x, grid_y, grid_z, lot_projected, to_wgs84, z_min, z_max):
    products = {}
    for interval in CONTOUR_INTERVALS_M:
        first = math.ceil((z_min - 1e-9) / interval) * interval
        last = math.floor((z_max + 1e-9) / interval) * interval
        levels = []
        level = first
        while level <= last + 1e-9:
            levels.append(round(level, 6))
            level += interval

        features = []
        for contour_level in levels:
            for row in range(len(grid_y) - 1):
                for col in range(len(grid_x) - 1):
                    vertices = [
                        (grid_x[col], grid_y[row]),
                        (grid_x[col + 1], grid_y[row]),
                        (grid_x[col + 1], grid_y[row + 1]),
                        (grid_x[col], grid_y[row + 1]),
                    ]
                    values = [
                        grid_z[row, col],
                        grid_z[row, col + 1],
                        grid_z[row + 1, col + 1],
                        grid_z[row + 1, col],
                    ]
                    for tri_indexes in ((0, 1, 2), (0, 2, 3)):
                        tri_values = [values[i] for i in tri_indexes]
                        if not all(np.isfinite(value) for value in tri_values):
                            continue
                        tri_vertices = [vertices[i] for i in tri_indexes]
                        segment = triangle_contour_segment(
                            tri_vertices, tri_values, contour_level
                        )
                        if not segment:
                            continue
                        clipped = LineString(segment).intersection(lot_projected)
                        for part in line_parts(clipped):
                            if part.length <= 1e-6:
                                continue
                            geographic = transform(to_wgs84.transform, part)
                            features.append(
                                {
                                    "type": "Feature",
                                    "geometry": mapping(geographic),
                                    "properties": {
                                        "elevationM": contour_level,
                                        "intervalM": interval,
                                    },
                                }
                            )
        products[str(interval)] = {
            "type": "FeatureCollection",
            "features": features,
        }
    return products


def triangle_plane(vertices):
    center_x = float(np.mean(vertices[:, 0]))
    center_y = float(np.mean(vertices[:, 1]))
    matrix = np.column_stack(
        [
            vertices[:, 0] - center_x,
            vertices[:, 1] - center_y,
            np.ones(3, dtype=np.float64),
        ]
    )
    try:
        dzdx, dzdy, intercept = np.linalg.solve(matrix, vertices[:, 2])
    except np.linalg.LinAlgError:
        return None
    gradient = math.hypot(float(dzdx), float(dzdy))
    slope_percent = gradient * 100.0
    slope_degrees = math.degrees(math.atan(gradient))
    uphill_aspect = math.degrees(math.atan2(float(dzdx), float(dzdy))) % 360.0
    downslope_aspect = (uphill_aspect + 180.0) % 360.0
    return {
        "dzdx": float(dzdx),
        "dzdy": float(dzdy),
        "intercept": float(intercept),
        "centerX": center_x,
        "centerY": center_y,
        "slopePercent": slope_percent,
        "slopeDegrees": slope_degrees,
        "downslopeAspectDegrees": downslope_aspect,
        "downslopeAspectLabel": compass_label(downslope_aspect),
    }


def build_tin(context_points, lot_projected, to_wgs84):
    triangulation = Delaunay(context_points[:, :2])
    features = []
    slope_values = []
    slope_weights = []
    for simplex in triangulation.simplices:
        vertices = context_points[simplex]
        plane = triangle_plane(vertices)
        if plane is None:
            continue
        polygon = Polygon(vertices[:, :2])
        if not polygon.is_valid or polygon.area <= 1e-6:
            continue
        clipped = polygon.intersection(lot_projected)
        if clipped.is_empty or clipped.area <= 1e-4:
            continue
        geographic = transform(to_wgs84.transform, clipped)
        slope_values.append(plane["slopePercent"])
        slope_weights.append(float(clipped.area))
        features.append(
            {
                "type": "Feature",
                "geometry": mapping(geographic),
                "properties": {
                    "slopePercent": round(plane["slopePercent"], 3),
                    "slopeDegrees": round(plane["slopeDegrees"], 3),
                    "downslopeAspectDegrees": round(
                        plane["downslopeAspectDegrees"], 2
                    ),
                    "downslopeAspectLabel": plane["downslopeAspectLabel"],
                    "meanElevationM": round(float(np.mean(vertices[:, 2])), 3),
                    "clippedAreaM2": round(float(clipped.area), 4),
                },
            }
        )
    return (
        {
            "type": "FeatureCollection",
            "features": features,
        },
        np.asarray(slope_values, dtype=np.float64),
        np.asarray(slope_weights, dtype=np.float64),
    )


def build_grid(context_points, lot_projected, to_wgs84):
    minx, miny, maxx, maxy = lot_projected.bounds
    start_x = math.floor(minx / GRID_RESOLUTION_M) * GRID_RESOLUTION_M
    end_x = math.ceil(maxx / GRID_RESOLUTION_M) * GRID_RESOLUTION_M
    start_y = math.floor(miny / GRID_RESOLUTION_M) * GRID_RESOLUTION_M
    end_y = math.ceil(maxy / GRID_RESOLUTION_M) * GRID_RESOLUTION_M
    grid_x = np.arange(
        start_x, end_x + GRID_RESOLUTION_M * 0.5, GRID_RESOLUTION_M
    )
    grid_y = np.arange(
        start_y, end_y + GRID_RESOLUTION_M * 0.5, GRID_RESOLUTION_M
    )
    mesh_x, mesh_y = np.meshgrid(grid_x, grid_y)

    triangulation = Delaunay(context_points[:, :2])
    interpolator = LinearNDInterpolator(
        triangulation, context_points[:, 2], fill_value=np.nan
    )
    grid_z = np.asarray(interpolator(mesh_x, mesh_y), dtype=np.float64)

    gradient_y, gradient_x = np.gradient(
        grid_z, GRID_RESOLUTION_M, GRID_RESOLUTION_M
    )
    slope_percent = np.hypot(gradient_x, gradient_y) * 100.0
    slope_degrees = np.degrees(np.arctan(slope_percent / 100.0))
    inside = contains_xy(lot_projected, mesh_x, mesh_y)
    valid = inside & np.isfinite(grid_z) & np.isfinite(slope_percent)
    local_slopes = slope_percent[valid]
    if local_slopes.size < 3:
        raise SystemExit(
            f"Insufficient interpolated grid samples inside lot: {local_slopes.size}"
        )

    max_flat = np.nanargmax(np.where(valid, slope_percent, np.nan))
    max_row, max_col = np.unravel_index(max_flat, slope_percent.shape)
    max_lon, max_lat = to_wgs84.transform(
        float(mesh_x[max_row, max_col]), float(mesh_y[max_row, max_col])
    )

    bands = []
    for lower, upper, label in SLOPE_BANDS:
        if upper is None:
            band_mask = local_slopes >= lower
        else:
            band_mask = (local_slopes >= lower) & (local_slopes < upper)
        count = int(np.count_nonzero(band_mask))
        bands.append(
            {
                "label": label,
                "lowerPercent": lower,
                "upperPercent": upper,
                "sampleCount": count,
                "sharePercent": float(count / local_slopes.size * 100.0),
                "approxAreaM2": float(count * GRID_RESOLUTION_M**2),
            }
        )

    elevation_rows = []
    slope_rows = []
    for row in range(grid_z.shape[0]):
        elevation_row = []
        slope_row = []
        for col in range(grid_z.shape[1]):
            if not inside[row, col] or not np.isfinite(grid_z[row, col]):
                elevation_row.append(None)
                slope_row.append(None)
                continue
            elevation_row.append(round(float(grid_z[row, col]), 3))
            slope_row.append(
                round(float(slope_percent[row, col]), 3)
                if np.isfinite(slope_percent[row, col])
                else None
            )
        elevation_rows.append(elevation_row)
        slope_rows.append(slope_row)

    return {
        "gridX": grid_x,
        "gridY": grid_y,
        "gridZ": grid_z,
        "product": {
            "crs": f"EPSG:{EXPECTED_EPSG}",
            "resolutionM": GRID_RESOLUTION_M,
            "originEasting": float(grid_x[0]),
            "originNorthing": float(grid_y[0]),
            "width": int(len(grid_x)),
            "height": int(len(grid_y)),
            "elevationM": elevation_rows,
            "slopePercent": slope_rows,
            "validSampleCount": int(local_slopes.size),
        },
        "metrics": {
            "meanPercent": float(np.mean(local_slopes)),
            "medianPercent": float(np.median(local_slopes)),
            "p95Percent": float(np.percentile(local_slopes, 95)),
            "maxPercent": float(np.max(local_slopes)),
            "maxDegrees": float(np.max(slope_degrees[valid])),
            "maxPoint": {
                "easting": float(mesh_x[max_row, max_col]),
                "northing": float(mesh_y[max_row, max_col]),
                "longitude": float(max_lon),
                "latitude": float(max_lat),
                "slopePercent": float(slope_percent[max_row, max_col]),
                "slopeDegrees": float(slope_degrees[max_row, max_col]),
            },
            "bands": bands,
        },
    }


def main():
    args = parse_args()
    if not args.zip_specs:
        raise SystemExit("At least one --zip sheet=path is required")

    geometry = json.loads(args.lot_geometry_json)
    lot_wgs84 = shape(geometry)
    if lot_wgs84.is_empty or not lot_wgs84.is_valid:
        raise SystemExit("Lot geometry is empty or invalid")

    to_projected = Transformer.from_crs(4326, EXPECTED_EPSG, always_xy=True)
    to_wgs84 = Transformer.from_crs(EXPECTED_EPSG, 4326, always_xy=True)
    lot_projected = transform(to_projected.transform, lot_wgs84)
    context_polygon = lot_projected.buffer(CONTEXT_BUFFER_M)
    context_minx, context_miny, context_maxx, context_maxy = context_polygon.bounds

    context_xs = []
    context_ys = []
    context_zs = []
    inputs = []
    detected_vertical_datums = set()

    with tempfile.TemporaryDirectory(prefix="lotediretor-terrain-") as temp_dir:
        temp_root = Path(temp_dir)
        for spec in args.zip_specs:
            if "=" not in spec:
                raise SystemExit(f"Invalid --zip value: {spec}")
            sheet_code, zip_path_text = spec.split("=", 1)
            zip_path = Path(zip_path_text)
            if not zip_path.is_file():
                raise SystemExit(f"ZIP not found: {zip_path}")

            with ZipFile(zip_path) as archive:
                laz_entries = [
                    item
                    for item in archive.infolist()
                    if not item.is_dir() and item.filename.lower().endswith(".laz")
                ]
                if len(laz_entries) != 1:
                    raise SystemExit(
                        f"Expected exactly one LAZ in {zip_path.name}, found {len(laz_entries)}"
                    )
                laz_entry = laz_entries[0]
                laz_path = temp_root / f"{sheet_code}.laz"
                with archive.open(laz_entry) as src, laz_path.open("wb") as dst:
                    while True:
                        chunk = src.read(1024 * 1024)
                        if not chunk:
                            break
                        dst.write(chunk)

            las = laspy.read(laz_path)
            crs = las.header.parse_crs()
            epsg = crs.to_epsg() if crs else None
            if epsg != EXPECTED_EPSG:
                raise SystemExit(
                    f"Unexpected LAZ CRS for {sheet_code}: EPSG:{epsg}, expected EPSG:{EXPECTED_EPSG}"
                )

            datum = vertical_datum(las.header)
            if datum:
                detected_vertical_datums.add(datum)

            x = np.asarray(las.x, dtype=np.float64)
            y = np.asarray(las.y, dtype=np.float64)
            z = np.asarray(las.z, dtype=np.float64)
            context_mask = (
                (x >= context_minx)
                & (x <= context_maxx)
                & (y >= context_miny)
                & (y <= context_maxy)
            )
            candidate_indexes = np.flatnonzero(context_mask)
            if candidate_indexes.size:
                in_buffer = contains_xy(
                    context_polygon, x[candidate_indexes], y[candidate_indexes]
                )
                selected = candidate_indexes[in_buffer]
            else:
                selected = np.array([], dtype=np.int64)

            context_xs.append(x[selected])
            context_ys.append(y[selected])
            context_zs.append(z[selected])
            inside_count = int(
                np.count_nonzero(
                    contains_xy(lot_projected, x[selected], y[selected])
                )
            )
            inputs.append(
                {
                    "sheetCode": sheet_code,
                    "pointCountTotal": int(len(las.points)),
                    "pointCountContext": int(selected.size),
                    "pointCountInsideLot": inside_count,
                    "lazFileName": laz_entry.filename,
                    "epsg": epsg,
                    "verticalDatum": datum,
                }
            )

    context_x = (
        np.concatenate(context_xs) if context_xs else np.array([], dtype=np.float64)
    )
    context_y = (
        np.concatenate(context_ys) if context_ys else np.array([], dtype=np.float64)
    )
    context_z = (
        np.concatenate(context_zs) if context_zs else np.array([], dtype=np.float64)
    )
    if context_z.size < 3:
        raise SystemExit(f"Insufficient MDT context points: {context_z.size}")

    context_points = np.unique(
        np.column_stack([context_x, context_y, context_z]), axis=0
    )
    inside_mask = contains_xy(
        lot_projected, context_points[:, 0], context_points[:, 1]
    )
    inside_points = context_points[inside_mask]
    if inside_points.shape[0] < 3:
        raise SystemExit(
            f"Insufficient MDT points inside lot: {inside_points.shape[0]}"
        )

    x = inside_points[:, 0]
    y = inside_points[:, 1]
    z = inside_points[:, 2]

    center_x = float(x.mean())
    center_y = float(y.mean())
    design = np.column_stack(
        [x - center_x, y - center_y, np.ones(z.size, dtype=np.float64)]
    )
    dzdx, dzdy, intercept = np.linalg.lstsq(design, z, rcond=None)[0]
    predicted = design @ np.array([dzdx, dzdy, intercept])
    gradient = math.hypot(float(dzdx), float(dzdy))
    slope_degrees = math.degrees(math.atan(gradient))
    slope_percent = gradient * 100.0
    uphill_aspect = math.degrees(math.atan2(float(dzdx), float(dzdy))) % 360.0
    downslope_aspect = (uphill_aspect + 180.0) % 360.0
    rmse = float(np.sqrt(np.mean((z - predicted) ** 2)))

    low_index = int(np.argmin(z))
    high_index = int(np.argmax(z))

    def point_payload(index):
        lon, lat = to_wgs84.transform(float(x[index]), float(y[index]))
        return {
            "easting": float(x[index]),
            "northing": float(y[index]),
            "longitude": float(lon),
            "latitude": float(lat),
            "elevationM": float(z[index]),
        }

    tin_product, tin_slopes, tin_weights = build_tin(
        context_points, lot_projected, to_wgs84
    )
    grid = build_grid(context_points, lot_projected, to_wgs84)
    contours = build_contours(
        grid["gridX"],
        grid["gridY"],
        grid["gridZ"],
        lot_projected,
        to_wgs84,
        float(np.min(z)),
        float(np.max(z)),
    )

    tin_weighted_mean = (
        float(np.average(tin_slopes, weights=tin_weights))
        if tin_slopes.size and float(np.sum(tin_weights)) > 0
        else None
    )

    vertical_datum_value = (
        sorted(detected_vertical_datums)[0]
        if len(detected_vertical_datums) == 1
        else sorted(detected_vertical_datums)
    )

    result = {
        "analysisVersion": ANALYSIS_VERSION,
        "horizontalCrs": f"EPSG:{EXPECTED_EPSG}",
        "verticalDatum": vertical_datum_value,
        "lotAreaM2": float(lot_projected.area),
        "pointCount": int(z.size),
        "contextPointCount": int(context_points.shape[0]),
        "pointDensityPerM2": float(z.size / lot_projected.area),
        "elevationMinM": float(np.min(z)),
        "elevationMaxM": float(np.max(z)),
        "elevationMeanM": float(np.mean(z)),
        "elevationMedianM": float(np.median(z)),
        "reliefAmplitudeM": float(np.max(z) - np.min(z)),
        "bestFitPlane": {
            "dzdx": float(dzdx),
            "dzdy": float(dzdy),
            "slopePercent": float(slope_percent),
            "slopeDegrees": float(slope_degrees),
            "downslopeAspectDegrees": float(downslope_aspect),
            "downslopeAspectLabel": compass_label(downslope_aspect),
            "rmseM": rmse,
        },
        "localSlope": {
            **grid["metrics"],
            "gridResolutionM": GRID_RESOLUTION_M,
            "method": "1 m linear interpolation over Delaunay triangulation; finite-difference gradient sampled inside lot",
        },
        "surface": {
            "version": "terrain-surface-v2",
            "contextBufferM": CONTEXT_BUFFER_M,
            "grid": grid["product"],
            "tin": tin_product,
            "tinTriangleCount": len(tin_product["features"]),
            "tinAreaWeightedMeanSlopePercent": tin_weighted_mean,
            "contours": contours,
            "contourIntervalsM": list(CONTOUR_INTERVALS_M),
        },
        "lowPoint": point_payload(low_index),
        "highPoint": point_payload(high_index),
        "inputs": inputs,
    }
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
