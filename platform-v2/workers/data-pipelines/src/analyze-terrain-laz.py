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
from shapely import contains_xy
from shapely.geometry import shape
from shapely.ops import transform

EXPECTED_EPSG = 31983
ANALYSIS_VERSION = "terrain-mdt-2020-plane-v1"


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
    minx, miny, maxx, maxy = lot_projected.bounds

    xs = []
    ys = []
    zs = []
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
                    item for item in archive.infolist()
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
            bbox_mask = (x >= minx) & (x <= maxx) & (y >= miny) & (y <= maxy)
            candidate_indexes = np.flatnonzero(bbox_mask)
            if candidate_indexes.size:
                inside = contains_xy(
                    lot_projected,
                    x[candidate_indexes],
                    y[candidate_indexes],
                )
                selected = candidate_indexes[inside]
            else:
                selected = np.array([], dtype=np.int64)

            xs.append(x[selected])
            ys.append(y[selected])
            zs.append(z[selected])
            inputs.append(
                {
                    "sheetCode": sheet_code,
                    "pointCountTotal": int(len(las.points)),
                    "pointCountInsideLot": int(selected.size),
                    "lazFileName": laz_entry.filename,
                    "epsg": epsg,
                    "verticalDatum": datum,
                }
            )

    x = np.concatenate(xs) if xs else np.array([], dtype=np.float64)
    y = np.concatenate(ys) if ys else np.array([], dtype=np.float64)
    z = np.concatenate(zs) if zs else np.array([], dtype=np.float64)
    if z.size < 3:
        raise SystemExit(f"Insufficient MDT points inside lot: {z.size}")

    points = np.unique(np.column_stack([x, y, z]), axis=0)
    x = points[:, 0]
    y = points[:, 1]
    z = points[:, 2]

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
        "lowPoint": point_payload(low_index),
        "highPoint": point_payload(high_index),
        "inputs": inputs,
    }
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
