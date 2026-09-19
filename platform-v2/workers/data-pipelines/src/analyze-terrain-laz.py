#!/usr/bin/env python3
import argparse
from heapq import heappop, heappush
import json
import math
import re
import tempfile
from pathlib import Path
from zipfile import ZipFile

import laspy
import numpy as np
from pyproj import Transformer
from scipy.interpolate import LinearNDInterpolator
from scipy.spatial import Delaunay
from shapely import contains_xy
from shapely.geometry import LineString, Point, Polygon, box, mapping, shape
from shapely.ops import nearest_points, transform, unary_union

EXPECTED_EPSG = 31983
ANALYSIS_VERSION = "terrain-mdt-2020-surface-v5"
GRID_RESOLUTION_M = 1.0
CONTEXT_BUFFER_M = 8.0
ANALYSIS_CONTEXT_BUFFER_M = 40.0
STREET_PROFILE_HALF_LENGTH_M = 20.0
STREET_PROFILE_SPACING_M = 1.0
MAX_STREET_CENTERLINE_DISTANCE_M = 35.0
CONTOUR_INTERVALS_M = (0.5, 1.0, 2.0, 5.0)
PROFILE_SPACING_M = 0.5
HYDROLOGY_EPSILON_M = 0.0001
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
    parser.add_argument("--street-candidates-json")
    parser.add_argument("--street-name")
    parser.add_argument("--street-number")
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



def geographic_plane_properties(vertices, to_wgs84):
    geographic_vertices = np.array(
        [
            [*to_wgs84.transform(float(vertex[0]), float(vertex[1])), float(vertex[2])]
            for vertex in vertices
        ],
        dtype=np.float64,
    )
    lon0 = float(np.mean(geographic_vertices[:, 0]))
    lat0 = float(np.mean(geographic_vertices[:, 1]))
    matrix = np.column_stack(
        [
            geographic_vertices[:, 0] - lon0,
            geographic_vertices[:, 1] - lat0,
            np.ones(3, dtype=np.float64),
        ]
    )
    try:
        dzdlon, dzdlat, elevation_origin = np.linalg.solve(
            matrix, geographic_vertices[:, 2]
        )
    except np.linalg.LinAlgError:
        return {}
    return {
        "elevationPlaneOriginLon": round(lon0, 9),
        "elevationPlaneOriginLat": round(lat0, 9),
        "elevationPlaneOriginM": round(float(elevation_origin), 6),
        "elevationDzDLon": round(float(dzdlon), 6),
        "elevationDzDLat": round(float(dzdlat), 6),
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
                    **geographic_plane_properties(vertices, to_wgs84),
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



def choose_profile_segment(intersection, anchor):
    parts = [part for part in line_parts(intersection) if part.length > 1e-6]
    if not parts:
        return None
    touching = [part for part in parts if part.distance(anchor) <= 1e-6]
    candidates = touching or parts
    return max(candidates, key=lambda item: item.length)


def profile_axis(lot_projected):
    rectangle = lot_projected.minimum_rotated_rectangle
    coordinates = list(rectangle.exterior.coords)
    edges = []
    for index in range(4):
        start = coordinates[index]
        end = coordinates[index + 1]
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        length = math.hypot(dx, dy)
        if length > 1e-9:
            edges.append((length, dx / length, dy / length))
    if not edges:
        raise SystemExit("Could not determine lot profile axis")
    _, ux, uy = max(edges, key=lambda item: item[0])
    return ux, uy


def build_profile(
    profile_id,
    label,
    lot_projected,
    context_points,
    to_wgs84,
    ux,
    uy,
):
    anchor = lot_projected.centroid
    if not lot_projected.covers(anchor):
        anchor = lot_projected.representative_point()

    minx, miny, maxx, maxy = lot_projected.bounds
    span = max(maxx - minx, maxy - miny, 1.0) * 4.0
    candidate = LineString(
        [
            (anchor.x - ux * span, anchor.y - uy * span),
            (anchor.x + ux * span, anchor.y + uy * span),
        ]
    )
    segment = choose_profile_segment(candidate.intersection(lot_projected), anchor)
    if segment is None or segment.length <= 1e-6:
        raise SystemExit(f"Could not build {profile_id} terrain profile")

    triangulation = Delaunay(context_points[:, :2])
    interpolator = LinearNDInterpolator(
        triangulation, context_points[:, 2], fill_value=np.nan
    )
    distances = list(np.arange(0.0, segment.length, PROFILE_SPACING_M))
    if not distances or not math.isclose(distances[-1], segment.length, abs_tol=1e-6):
        distances.append(float(segment.length))

    samples = []
    geographic_coordinates = []
    for distance in distances:
        point = segment.interpolate(float(distance))
        elevation_value = interpolator(point.x, point.y)
        elevation = float(np.asarray(elevation_value).reshape(-1)[0])
        if not np.isfinite(elevation):
            continue
        lon, lat = to_wgs84.transform(float(point.x), float(point.y))
        geographic_coordinates.append([float(lon), float(lat)])
        samples.append(
            {
                "distanceM": round(float(distance), 3),
                "elevationM": round(elevation, 3),
                "longitude": round(float(lon), 9),
                "latitude": round(float(lat), 9),
            }
        )

    if len(samples) < 2:
        raise SystemExit(f"Insufficient samples for {profile_id} terrain profile")

    length_m = float(samples[-1]["distanceM"] - samples[0]["distanceM"])
    elevation_start = float(samples[0]["elevationM"])
    elevation_end = float(samples[-1]["elevationM"])
    net_grade = (
        (elevation_end - elevation_start) / length_m * 100.0
        if length_m > 0
        else 0.0
    )
    elevations = np.array([sample["elevationM"] for sample in samples], dtype=np.float64)
    return {
        "id": profile_id,
        "label": label,
        "spacingM": PROFILE_SPACING_M,
        "lengthM": length_m,
        "elevationStartM": elevation_start,
        "elevationEndM": elevation_end,
        "elevationMinM": float(np.min(elevations)),
        "elevationMaxM": float(np.max(elevations)),
        "reliefAmplitudeM": float(np.max(elevations) - np.min(elevations)),
        "netGradePercent": float(net_grade),
        "line": {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": geographic_coordinates,
            },
            "properties": {
                "profileId": profile_id,
                "label": label,
            },
        },
        "samples": samples,
    }


def build_profiles(lot_projected, context_points, to_wgs84):
    ux, uy = profile_axis(lot_projected)
    longitudinal = build_profile(
        "principal",
        "Perfil principal",
        lot_projected,
        context_points,
        to_wgs84,
        ux,
        uy,
    )
    transverse = build_profile(
        "transversal",
        "Perfil transversal",
        lot_projected,
        context_points,
        to_wgs84,
        -uy,
        ux,
    )
    return {
        "method": "Profiles through the lot centroid along the major axis of the minimum rotated rectangle and its perpendicular; elevation sampled every 0.5 m from the Delaunay surface",
        "spacingM": PROFILE_SPACING_M,
        "principal": longitudinal,
        "transversal": transverse,
    }




def hydrology_neighbors(row, col, height, width):
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr == 0 and dc == 0:
                continue
            rr = row + dr
            cc = col + dc
            if 0 <= rr < height and 0 <= cc < width:
                yield rr, cc, math.sqrt(2.0) if dr and dc else 1.0


def priority_flood(elevation, valid):
    height, width = elevation.shape
    filled = np.array(elevation, copy=True)
    visited = np.zeros_like(valid, dtype=bool)
    heap = []

    for row in range(height):
        for col in range(width):
            if not valid[row, col]:
                continue
            boundary = (
                row == 0
                or col == 0
                or row == height - 1
                or col == width - 1
                or any(
                    not valid[rr, cc]
                    for rr, cc, _distance in hydrology_neighbors(
                        row, col, height, width
                    )
                )
            )
            if boundary:
                visited[row, col] = True
                heappush(heap, (float(filled[row, col]), row, col))

    while heap:
        current_elevation, row, col = heappop(heap)
        for rr, cc, _distance in hydrology_neighbors(row, col, height, width):
            if not valid[rr, cc] or visited[rr, cc]:
                continue
            visited[rr, cc] = True
            next_elevation = max(
                float(elevation[rr, cc]),
                current_elevation + HYDROLOGY_EPSILON_M,
            )
            filled[rr, cc] = next_elevation
            heappush(heap, (next_elevation, rr, cc))

    return filled


def build_flow_direction(filled, valid):
    height, width = filled.shape
    downstream = np.full((height, width, 2), -1, dtype=np.int32)
    for row in range(height):
        for col in range(width):
            if not valid[row, col]:
                continue
            current = float(filled[row, col])
            best = None
            best_gradient = 0.0
            for rr, cc, distance in hydrology_neighbors(row, col, height, width):
                if not valid[rr, cc]:
                    continue
                drop = current - float(filled[rr, cc])
                gradient = drop / distance
                if gradient > best_gradient + 1e-12:
                    best_gradient = gradient
                    best = (rr, cc)
            if best is not None:
                downstream[row, col] = best
    return downstream


def flow_accumulation(filled, valid, downstream):
    accumulation = np.zeros_like(filled, dtype=np.float64)
    accumulation[valid] = 1.0
    cells = np.argwhere(valid)
    order = sorted(
        ((float(filled[row, col]), int(row), int(col)) for row, col in cells),
        reverse=True,
    )
    for _elevation, row, col in order:
        rr, cc = downstream[row, col]
        if rr >= 0 and cc >= 0:
            accumulation[rr, cc] += accumulation[row, col]
    return accumulation


def trace_lot_outlet(row, col, inside_lot, downstream):
    seen = set()
    current = (int(row), int(col))
    last_inside = current
    while current not in seen:
        seen.add(current)
        rr, cc = downstream[current]
        if rr < 0 or cc < 0:
            return last_inside
        next_cell = (int(rr), int(cc))
        if not inside_lot[next_cell]:
            return last_inside
        last_inside = next_cell
        current = next_cell
    return last_inside


def cluster_outlets(outlets):
    remaining = set(outlets)
    clusters = []
    while remaining:
        seed = remaining.pop()
        stack = [seed]
        cluster = {seed}
        while stack:
            row, col = stack.pop()
            adjacent = [
                (row + dr, col + dc)
                for dr in (-1, 0, 1)
                for dc in (-1, 0, 1)
                if not (dr == 0 and dc == 0)
            ]
            for cell in adjacent:
                if cell in remaining:
                    remaining.remove(cell)
                    cluster.add(cell)
                    stack.append(cell)
        clusters.append(cluster)
    return clusters


def basin_cell_polygon(row, col, grid_x, grid_y, resolution):
    x = float(grid_x[col])
    y = float(grid_y[row])
    half = resolution / 2.0
    return box(x - half, y - half, x + half, y + half)


def build_hydrology(context_points, lot_projected, context_polygon, to_wgs84):
    minx, miny, maxx, maxy = context_polygon.bounds
    resolution = GRID_RESOLUTION_M
    grid_x = np.arange(
        math.floor(minx / resolution) * resolution,
        math.ceil(maxx / resolution) * resolution + resolution * 0.5,
        resolution,
    )
    grid_y = np.arange(
        math.floor(miny / resolution) * resolution,
        math.ceil(maxy / resolution) * resolution + resolution * 0.5,
        resolution,
    )
    mesh_x, mesh_y = np.meshgrid(grid_x, grid_y)

    triangulation = Delaunay(context_points[:, :2])
    interpolator = LinearNDInterpolator(
        triangulation, context_points[:, 2], fill_value=np.nan
    )
    elevation = np.asarray(interpolator(mesh_x, mesh_y), dtype=np.float64)
    inside_context = contains_xy(context_polygon, mesh_x, mesh_y)
    valid = inside_context & np.isfinite(elevation)
    inside_lot = contains_xy(lot_projected, mesh_x, mesh_y) & valid
    if np.count_nonzero(inside_lot) < 3:
        raise SystemExit("Insufficient hydrology grid samples inside lot")

    filled = priority_flood(elevation, valid)
    downstream = build_flow_direction(filled, valid)
    accumulation = flow_accumulation(filled, valid, downstream)

    lot_cells = [tuple(map(int, cell)) for cell in np.argwhere(inside_lot)]
    raw_outlet_by_cell = {
        cell: trace_lot_outlet(cell[0], cell[1], inside_lot, downstream)
        for cell in lot_cells
    }
    outlet_cells = sorted(set(raw_outlet_by_cell.values()))
    outlet_clusters = cluster_outlets(outlet_cells)
    outlet_cluster_by_cell = {}
    for basin_id, cluster in enumerate(outlet_clusters, start=1):
        for cell in cluster:
            outlet_cluster_by_cell[cell] = basin_id

    basin_cells = {}
    for cell, outlet in raw_outlet_by_cell.items():
        basin_id = outlet_cluster_by_cell[outlet]
        basin_cells.setdefault(basin_id, []).append(cell)

    basin_features = []
    basin_geometries = {}
    outlet_features = []
    representative_outlets = {}
    ranked_basins = sorted(
        basin_cells.items(), key=lambda item: len(item[1]), reverse=True
    )
    rank_by_basin = {
        basin_id: rank
        for rank, (basin_id, _cells) in enumerate(ranked_basins, start=1)
    }

    for basin_id, cells in ranked_basins:
        polygons = [
            basin_cell_polygon(row, col, grid_x, grid_y, resolution)
            for row, col in cells
        ]
        basin_geometry = unary_union(polygons).intersection(lot_projected)
        basin_geometries[basin_id] = basin_geometry
        geographic_basin = transform(to_wgs84.transform, basin_geometry)
        basin_features.append(
            {
                "type": "Feature",
                "geometry": mapping(geographic_basin),
                "properties": {
                    "basinId": basin_id,
                    "rank": rank_by_basin[basin_id],
                    "approxAreaM2": round(float(basin_geometry.area), 3),
                    "sampleCount": len(cells),
                },
            }
        )

        cluster_cells = [
            cell
            for cell, cluster_id in outlet_cluster_by_cell.items()
            if cluster_id == basin_id
        ]
        representative = max(
            cluster_cells,
            key=lambda cell: float(accumulation[cell]),
        )
        representative_outlets[basin_id] = representative
        row, col = representative
        lon, lat = to_wgs84.transform(float(grid_x[col]), float(grid_y[row]))
        outlet_features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(lon), float(lat)],
                },
                "properties": {
                    "basinId": basin_id,
                    "rank": rank_by_basin[basin_id],
                    "elevationM": round(float(elevation[row, col]), 3),
                    "accumulationSamples": round(float(accumulation[row, col]), 3),
                },
            }
        )

    divide_features = []
    basin_ids = list(basin_geometries)
    for index, left_id in enumerate(basin_ids):
        left = basin_geometries[left_id]
        for right_id in basin_ids[index + 1 :]:
            shared = left.boundary.intersection(basin_geometries[right_id].boundary)
            for part in line_parts(shared):
                if part.length < 0.25:
                    continue
                geographic = transform(to_wgs84.transform, part)
                divide_features.append(
                    {
                        "type": "Feature",
                        "geometry": mapping(geographic),
                        "properties": {
                            "leftBasinId": left_id,
                            "rightBasinId": right_id,
                        },
                    }
                )

    upstream = {}
    for row, col in lot_cells:
        rr, cc = downstream[row, col]
        if rr >= 0 and cc >= 0 and inside_lot[rr, cc]:
            upstream.setdefault((int(rr), int(cc)), []).append((row, col))

    flow_features = []
    for basin_id, _cells in ranked_basins:
        outlet = representative_outlets[basin_id]
        path = [outlet]
        current = outlet
        seen = {current}
        while True:
            candidates = [
                cell
                for cell in upstream.get(current, [])
                if outlet_cluster_by_cell[
                    raw_outlet_by_cell[cell]
                ] == basin_id
                and cell not in seen
            ]
            if not candidates:
                break
            next_cell = max(
                candidates,
                key=lambda cell: float(accumulation[cell]),
            )
            path.append(next_cell)
            seen.add(next_cell)
            current = next_cell

        path.reverse()
        if len(path) < 2:
            continue
        projected_line = LineString(
            [(float(grid_x[col]), float(grid_y[row])) for row, col in path]
        )
        if projected_line.length < 0.5:
            continue
        geographic = transform(to_wgs84.transform, projected_line)
        flow_features.append(
            {
                "type": "Feature",
                "geometry": mapping(geographic),
                "properties": {
                    "basinId": basin_id,
                    "rank": rank_by_basin[basin_id],
                    "lengthM": round(float(projected_line.length), 3),
                },
            }
        )

    vectors = []
    weights = []
    for row, col in lot_cells:
        rr, cc = downstream[row, col]
        if rr < 0 or cc < 0:
            continue
        dx = float(grid_x[cc] - grid_x[col])
        dy = float(grid_y[rr] - grid_y[row])
        length = math.hypot(dx, dy)
        if length <= 0:
            continue
        vectors.append((dx / length, dy / length))
        weights.append(math.sqrt(max(float(accumulation[row, col]), 1.0)))

    if vectors:
        vector_array = np.asarray(vectors, dtype=np.float64)
        weight_array = np.asarray(weights, dtype=np.float64)
        mean_dx = float(np.average(vector_array[:, 0], weights=weight_array))
        mean_dy = float(np.average(vector_array[:, 1], weights=weight_array))
        direction_degrees = math.degrees(math.atan2(mean_dx, mean_dy)) % 360.0
        direction_label = compass_label(direction_degrees)
    else:
        direction_degrees = None
        direction_label = None

    depression_depth = np.where(
        inside_lot,
        np.maximum(filled - elevation, 0.0),
        0.0,
    )
    depression_cells = depression_depth[inside_lot]
    max_fill_depth = float(np.max(depression_cells)) if depression_cells.size else 0.0
    fill_volume = float(np.sum(depression_cells) * resolution * resolution)
    affected_count = int(np.count_nonzero(depression_cells > 0.01))

    main_basin_id = ranked_basins[0][0]
    main_basin_geometry = basin_geometries[main_basin_id]
    main_outlet = representative_outlets[main_basin_id]
    main_row, main_col = main_outlet
    main_lon, main_lat = to_wgs84.transform(
        float(grid_x[main_col]), float(grid_y[main_row])
    )

    return {
        "method": "Preliminary terrain-only runoff screening on a 1 m interpolated grid with an 8 m terrain context buffer; Priority-Flood depression routing followed by D8 flow direction and internal lot basin grouping. Does not model rainfall, infiltration, pipes, curbs, walls or future grading.",
        "gridResolutionM": resolution,
        "contextBufferM": CONTEXT_BUFFER_M,
        "preferredRunoffDirectionDegrees": direction_degrees,
        "preferredRunoffDirectionLabel": direction_label,
        "basinCount": len(ranked_basins),
        "outletCount": len(outlet_clusters),
        "mainInternalBasinApproxAreaM2": float(main_basin_geometry.area),
        "mainOutlet": {
            "longitude": float(main_lon),
            "latitude": float(main_lat),
            "elevationM": float(elevation[main_row, main_col]),
            "basinId": main_basin_id,
        },
        "depressionScreening": {
            "maxFillDepthM": max_fill_depth,
            "estimatedFillVolumeM3": fill_volume,
            "affectedSampleCountAbove1Cm": affected_count,
        },
        "basins": {
            "type": "FeatureCollection",
            "features": basin_features,
        },
        "divides": {
            "type": "FeatureCollection",
            "features": divide_features,
        },
        "flowPaths": {
            "type": "FeatureCollection",
            "features": flow_features,
        },
        "outlets": {
            "type": "FeatureCollection",
            "features": outlet_features,
        },
    }




def _number(value):
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        digits = ''.join(ch for ch in str(value) if ch.isdigit())
        return int(digits) if digits else None


def _address_range_matches(properties, street_number):
    number = _number(street_number)
    if number is None:
        return False
    if number % 2 == 0:
        low = _number(properties.get('cd_numero_inicial_par'))
        high = _number(properties.get('cd_numero_final_par'))
    else:
        low = _number(properties.get('cd_numero_inicial_impar'))
        high = _number(properties.get('cd_numero_final_impar'))
    if low is None or high is None:
        return False
    minimum = min(low, high)
    maximum = max(low, high)
    return minimum <= number <= maximum


def _sample_interpolator(interpolator, x, y):
    value = interpolator(float(x), float(y))
    result = float(np.asarray(value).reshape(-1)[0])
    return result if np.isfinite(result) else None


def _unavailable_access(street_name, street_number, reason):
    return {
        'status': 'NAO_DISPONIVEL',
        'streetName': street_name,
        'streetNumber': street_number,
        'reason': reason,
        'method': (
            'Street-access screening requires a matching cadastral street segment and '
            'interpolable MDT coverage around the lot; unavailable results do not affect '
            'the remaining terrain product.'
        ),
    }


def build_access_analysis(
    lot_projected,
    context_points,
    to_projected,
    to_wgs84,
    street_candidates,
    street_name,
    street_number,
):
    if not street_name:
        return _unavailable_access(None, street_number, 'Lot has no confirmed street name')
    features = (street_candidates or {}).get('features') or []
    if not features:
        return _unavailable_access(
            street_name, street_number, 'No matching cadastral street segment was returned'
        )

    candidates = []
    for feature in features:
        geometry = feature.get('geometry')
        if not geometry:
            continue
        try:
            projected_geometry = transform(to_projected.transform, shape(geometry))
        except Exception:
            continue
        properties = feature.get('properties') or {}
        for part in line_parts(projected_geometry):
            distance = float(lot_projected.distance(part))
            candidates.append(
                {
                    'feature': feature,
                    'properties': properties,
                    'line': part,
                    'distanceM': distance,
                    'addressRangeMatched': _address_range_matches(
                        properties, street_number
                    ),
                }
            )

    if not candidates:
        return _unavailable_access(
            street_name, street_number, 'Matching street features contain no usable line geometry'
        )

    candidates.sort(
        key=lambda item: (
            0 if item['addressRangeMatched'] else 1,
            item['distanceM'],
            str(item['properties'].get('cd_identificador') or ''),
        )
    )
    selected = candidates[0]
    if selected['distanceM'] > MAX_STREET_CENTERLINE_DISTANCE_M:
        return _unavailable_access(
            street_name,
            street_number,
            f"Nearest matching street axis is {selected['distanceM']:.2f} m from the lot",
        )

    line = selected['line']
    lot_point, axis_point = nearest_points(lot_projected.boundary, line)
    axis_distance = float(line.project(axis_point))
    profile_start = max(0.0, axis_distance - STREET_PROFILE_HALF_LENGTH_M)
    profile_end = min(float(line.length), axis_distance + STREET_PROFILE_HALF_LENGTH_M)
    if profile_end - profile_start < 2.0:
        return _unavailable_access(
            street_name, street_number, 'Selected street segment is too short for a local grade profile'
        )

    triangulation = Delaunay(context_points[:, :2])
    interpolator = LinearNDInterpolator(
        triangulation, context_points[:, 2], fill_value=np.nan
    )
    lot_elevation = _sample_interpolator(interpolator, lot_point.x, lot_point.y)
    street_elevation = _sample_interpolator(interpolator, axis_point.x, axis_point.y)
    if lot_elevation is None or street_elevation is None:
        return _unavailable_access(
            street_name,
            street_number,
            'MDT interpolation does not cover both the lot boundary and street axis points',
        )

    sample_positions = list(
        np.arange(profile_start, profile_end, STREET_PROFILE_SPACING_M)
    )
    if not sample_positions or not math.isclose(
        sample_positions[-1], profile_end, abs_tol=1e-6
    ):
        sample_positions.append(profile_end)

    profile_samples = []
    profile_coordinates = []
    for position in sample_positions:
        point = line.interpolate(float(position))
        elevation = _sample_interpolator(interpolator, point.x, point.y)
        if elevation is None:
            continue
        lon, lat = to_wgs84.transform(float(point.x), float(point.y))
        profile_samples.append(
            {
                'distanceM': round(float(position - profile_start), 3),
                'elevationM': round(float(elevation), 3),
                'longitude': round(float(lon), 9),
                'latitude': round(float(lat), 9),
            }
        )
        profile_coordinates.append([float(lon), float(lat)])

    if len(profile_samples) < 3:
        return _unavailable_access(
            street_name, street_number, 'Insufficient MDT samples for the local street profile'
        )

    local_grades = []
    for left, right in zip(profile_samples, profile_samples[1:]):
        distance = float(right['distanceM']) - float(left['distanceM'])
        if distance <= 0:
            continue
        elevation_delta = float(right['elevationM']) - float(left['elevationM'])
        local_grades.append(abs(elevation_delta / distance * 100.0))
    grade_values = np.asarray(local_grades, dtype=np.float64)
    profile_length = float(
        profile_samples[-1]['distanceM'] - profile_samples[0]['distanceM']
    )
    profile_delta = float(
        profile_samples[-1]['elevationM'] - profile_samples[0]['elevationM']
    )

    lot_lon, lot_lat = to_wgs84.transform(float(lot_point.x), float(lot_point.y))
    axis_lon, axis_lat = to_wgs84.transform(float(axis_point.x), float(axis_point.y))
    connector_distance = float(lot_point.distance(axis_point))
    elevation_difference = float(lot_elevation - street_elevation)
    straight_grade = (
        abs(elevation_difference) / connector_distance * 100.0
        if connector_distance > 1e-6
        else 0.0
    )
    properties = selected['properties']
    segment_id = properties.get('cd_identificador')
    selection_method = (
        'ADDRESS_RANGE_AND_PROXIMITY'
        if selected['addressRangeMatched']
        else 'STREET_NAME_AND_PROXIMITY'
    )

    return {
        'status': 'DISPONIVEL',
        'streetName': street_name,
        'streetNumber': street_number,
        'selectedSegmentId': segment_id,
        'selectionMethod': selection_method,
        'addressRangeMatched': bool(selected['addressRangeMatched']),
        'streetCenterlineDistanceM': connector_distance,
        'lotBoundaryElevationM': float(lot_elevation),
        'streetAxisElevationM': float(street_elevation),
        'lotAboveStreetM': elevation_difference,
        'straightConnectionGradePercent': straight_grade,
        'candidateAccessPoint': {
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [float(lot_lon), float(lot_lat)],
            },
            'properties': {'role': 'lot-boundary-access-candidate'},
        },
        'streetAxisPoint': {
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [float(axis_lon), float(axis_lat)],
            },
            'properties': {'role': 'street-axis-reference'},
        },
        'accessConnector': {
            'type': 'Feature',
            'geometry': {
                'type': 'LineString',
                'coordinates': [
                    [float(axis_lon), float(axis_lat)],
                    [float(lot_lon), float(lot_lat)],
                ],
            },
            'properties': {'role': 'straight-access-screening'},
        },
        'streetProfile': {
            'spacingM': STREET_PROFILE_SPACING_M,
            'lengthM': profile_length,
            'elevationStartM': float(profile_samples[0]['elevationM']),
            'elevationEndM': float(profile_samples[-1]['elevationM']),
            'netGradePercent': (profile_delta / profile_length * 100.0) if profile_length > 0 else 0.0,
            'medianAbsoluteGradePercent': float(np.median(grade_values)) if grade_values.size else 0.0,
            'p95AbsoluteGradePercent': float(np.percentile(grade_values, 95)) if grade_values.size else 0.0,
            'maxAbsoluteGradePercent': float(np.max(grade_values)) if grade_values.size else 0.0,
            'line': {
                'type': 'Feature',
                'geometry': {
                    'type': 'LineString',
                    'coordinates': profile_coordinates,
                },
                'properties': {
                    'role': 'street-grade-profile',
                    'segmentId': segment_id,
                },
            },
            'samples': profile_samples,
        },
        'method': (
            'Cadastral street segment selected by confirmed lot street name, address range when available, '
            'and geometric proximity. Elevations are interpolated from the MDT; the local street profile spans '
            'up to 20 m on each side of the nearest axis point. The candidate access point is the nearest lot-boundary '
            'point to the street axis. This is a preliminary terrain screening and does not represent surveyed curb, '
            'gutter, sidewalk, driveway approval or legal frontage.'
        ),
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
    analysis_context_polygon = lot_projected.buffer(ANALYSIS_CONTEXT_BUFFER_M)
    hydrology_context_polygon = lot_projected.buffer(CONTEXT_BUFFER_M)
    context_minx, context_miny, context_maxx, context_maxy = analysis_context_polygon.bounds

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
                    analysis_context_polygon, x[candidate_indexes], y[candidate_indexes]
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
    hydrology_mask = contains_xy(
        hydrology_context_polygon, context_points[:, 0], context_points[:, 1]
    )
    hydrology_points = context_points[hydrology_mask]
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
    profiles = build_profiles(
        lot_projected,
        context_points,
        to_wgs84,
    )
    hydrology = build_hydrology(
        hydrology_points,
        lot_projected,
        hydrology_context_polygon,
        to_wgs84,
    )
    street_candidates = (
        json.loads(args.street_candidates_json)
        if args.street_candidates_json
        else {"type": "FeatureCollection", "features": []}
    )
    access = build_access_analysis(
        lot_projected,
        context_points,
        to_projected,
        to_wgs84,
        street_candidates,
        args.street_name,
        args.street_number,
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
            "version": "terrain-surface-v5",
            "contextBufferM": ANALYSIS_CONTEXT_BUFFER_M,
            "grid": grid["product"],
            "tin": tin_product,
            "tinTriangleCount": len(tin_product["features"]),
            "tinAreaWeightedMeanSlopePercent": tin_weighted_mean,
            "contours": contours,
            "contourIntervalsM": list(CONTOUR_INTERVALS_M),
            "profiles": profiles,
            "hydrology": hydrology,
            "access": access,
        },
        "lowPoint": point_payload(low_index),
        "highPoint": point_payload(high_index),
        "inputs": inputs,
    }
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
