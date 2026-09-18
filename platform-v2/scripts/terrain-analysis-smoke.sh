#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example)

"${COMPOSE[@]}" --profile ingest build data-pipelines >/dev/null
"${COMPOSE[@]}" --profile ingest run --rm --no-deps --entrypoint /opt/terrain-venv/bin/python data-pipelines - <<'PY'
import contextlib
import io
import json
import math
import runpy
import sys
import tempfile
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile

import laspy
import numpy as np
from pyproj import CRS, Transformer

with tempfile.TemporaryDirectory(prefix='terrain-smoke-') as temp:
    root = Path(temp)
    x0, y0 = 320000.0, 7400000.0
    xs, ys, zs = [], [], []
    for dx in (0.0, 5.0, 10.0):
        for dy in (0.0, 5.0, 10.0):
            xs.append(x0 + dx)
            ys.append(y0 + dy)
            zs.append(100.0 + 0.05 * dx + 0.02 * dy)

    header = laspy.LasHeader(point_format=1, version='1.2')
    header.add_crs(CRS.from_epsg(31983))
    las = laspy.LasData(header)
    las.x = np.array(xs)
    las.y = np.array(ys)
    las.z = np.array(zs)
    laz_path = root / 'MDT_TEST_1000.laz'
    las.write(laz_path)

    zip_path = root / 'fixture.zip'
    with ZipFile(zip_path, 'w', compression=ZIP_STORED) as archive:
        archive.write(laz_path, laz_path.name)

    to_wgs84 = Transformer.from_crs(31983, 4326, always_xy=True)
    corners = [
        to_wgs84.transform(x0 - 1, y0 - 1),
        to_wgs84.transform(x0 + 11, y0 - 1),
        to_wgs84.transform(x0 + 11, y0 + 11),
        to_wgs84.transform(x0 - 1, y0 + 11),
        to_wgs84.transform(x0 - 1, y0 - 1),
    ]
    geometry = {'type': 'Polygon', 'coordinates': [[list(point) for point in corners]]}

    sys.argv = [
        'analyze-terrain-laz.py',
        '--lot-geometry-json',
        json.dumps(geometry, separators=(',', ':')),
        '--zip',
        f'TEST={zip_path}',
    ]
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        runpy.run_path('/workspace/workers/data-pipelines/dist/analyze-terrain-laz.py', run_name='__main__')
    result = json.loads(output.getvalue().strip().splitlines()[-1])

    expected_slope = math.hypot(0.05, 0.02) * 100.0
    assert result['horizontalCrs'] == 'EPSG:31983', result
    assert result['pointCount'] == 9, result
    assert abs(result['elevationMinM'] - 100.0) < 0.01, result
    assert abs(result['elevationMaxM'] - 100.7) < 0.01, result
    assert abs(result['reliefAmplitudeM'] - 0.7) < 0.02, result
    assert abs(result['bestFitPlane']['slopePercent'] - expected_slope) < 0.05, result
    assert result['analysisVersion'] == 'terrain-mdt-2020-surface-v4', result
    assert abs(result['localSlope']['medianPercent'] - expected_slope) < 0.2, result
    assert abs(result['localSlope']['p95Percent'] - expected_slope) < 0.2, result
    assert result['surface']['version'] == 'terrain-surface-v4', result
    assert result['surface']['grid']['resolutionM'] == 1.0, result
    assert result['surface']['tinTriangleCount'] > 0, result
    assert set(result['surface']['contours']) == {'0.5','1.0','2.0','5.0'}, result
    profiles=result['surface']['profiles']
    assert profiles['spacingM'] == 0.5, profiles
    assert profiles['principal']['lengthM'] > 0, profiles
    assert profiles['transversal']['lengthM'] > 0, profiles
    assert len(profiles['principal']['samples']) >= 3, profiles
    assert len(profiles['transversal']['samples']) >= 3, profiles
    tin_props=result['surface']['tin']['features'][0]['properties']
    for key in ['elevationPlaneOriginLon','elevationPlaneOriginLat','elevationPlaneOriginM','elevationDzDLon','elevationDzDLat']:
        assert key in tin_props, tin_props
    hydrology=result['surface']['hydrology']
    assert hydrology['basinCount'] >= 1, hydrology
    assert hydrology['outletCount'] >= 1, hydrology
    assert hydrology['mainInternalBasinApproxAreaM2'] > 0, hydrology
    assert hydrology['flowPaths']['type'] == 'FeatureCollection', hydrology
    assert hydrology['basins']['type'] == 'FeatureCollection', hydrology
    assert hydrology['outlets']['type'] == 'FeatureCollection', hydrology
    assert hydrology['depressionScreening']['maxFillDepthM'] >= 0, hydrology
    assert result['inputs'][0]['sheetCode'] == 'TEST', result
    print(json.dumps({'terrain-analysis-smoke': 'OK', 'globalSlopePercent': result['bestFitPlane']['slopePercent'], 'localP95Percent': result['localSlope']['p95Percent'], 'tinTriangles': result['surface']['tinTriangleCount'], 'principalProfileM': profiles['principal']['lengthM'], 'transversalProfileM': profiles['transversal']['lengthM'], 'hydrologyBasins': hydrology['basinCount']}))
PY
