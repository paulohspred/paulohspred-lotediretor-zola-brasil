#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example)

"${COMPOSE[@]}" up -d postgres
"${COMPOSE[@]}" --profile migrate run --rm migrate-platform >/dev/null
"${COMPOSE[@]}" up -d --build platform-api

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:54000/api/v1/health >/tmp/ld-api-health.json 2>/dev/null; then break; fi
  sleep 1
done

python3 - <<'PY'
import json
j=json.load(open('/tmp/ld-api-health.json'))
assert j['status']=='ok', j
assert j['database']=='ok', j
PY

curl -fsS 'http://127.0.0.1:54000/api/v1/sources?municipalityIbge=3550308' >/tmp/ld-api-sources.json
python3 - <<'PY'
import json
rows=json.load(open('/tmp/ld-api-sources.json'))
assert len(rows)==10, len(rows)
assert all(r['municipalityIbge']=='3550308' for r in rows)
assert any(r['sourceCode']=='PMSP_GEOSAMPA_LOTES' for r in rows)
assert any(r['sourceCode']=='PMSP_TERRITORIO_TOPOGRAFIA' for r in rows)
PY

curl -fsS 'http://127.0.0.1:54000/api/v1/sources/PMSP_TERRITORIO_TOPOGRAFIA?municipalityIbge=3550308' >/tmp/ld-api-topography-source.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/ld-api-topography-source.json'))
assert j['sourceCode']=='PMSP_TERRITORIO_TOPOGRAFIA', j
assert {e['type'] for e in j['endpoints']} >= {'WFS','DOWNLOAD'}, j['endpoints']
PY

curl -fsS 'http://127.0.0.1:54000/api/v1/sources/PMSP_GEOSAMPA_LOTES?municipalityIbge=3550308' >/tmp/ld-api-source.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/ld-api-source.json'))
assert j['sourceCode']=='PMSP_GEOSAMPA_LOTES', j
assert j['datasetCode']=='LOTE_FISCAL', j
assert j['endpoints'], j
PY

test "$(curl -sS -o /tmp/notfound -w '%{http_code}' http://127.0.0.1:54000/api/v1/sources/NAO_EXISTE)" = 404

curl -fsS 'http://127.0.0.1:54000/api/v1/source-snapshots?municipalityIbge=3550308&limit=10' >/tmp/ld-api-snapshots.json
python3 - <<'PY'
import json
rows=json.load(open('/tmp/ld-api-snapshots.json'))
assert isinstance(rows, list), rows
for row in rows:
    assert row['sourceRegistryId'], row
    assert row['sourceCode'], row
    assert len(row['sha256'])==64, row
    assert row['ingestedAt'], row
PY

test "$(curl -sS -o /tmp/ld-api-snapshot-notfound -w '%{http_code}' http://127.0.0.1:54000/api/v1/source-snapshots/00000000-0000-0000-0000-000000000000)" = 404

curl -fsS -H 'content-type: application/json' \
  --data '{"query":"query { sources(municipalityIbge: \"3550308\") { sourceCode datasetCode ingestionStatus } }"}' \
  http://127.0.0.1:54000/graphql >/tmp/ld-api-graphql.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/ld-api-graphql.json'))
assert 'errors' not in j, j
assert len(j['data']['sources'])==10, j
PY

curl -fsS 'http://127.0.0.1:54000/api/v1/evidence?municipalityIbge=3550308&subjectType=SP_LOT&subjectId=123456789&limit=10' >/tmp/ld-api-evidence.json
python3 - <<'PY'
import json
rows=json.load(open('/tmp/ld-api-evidence.json'))
assert isinstance(rows, list), rows
for row in rows:
    assert row['status'] in {'CONFIRMADO','CALCULADO','INFERIDO','PENDENTE','CONFLITANTE','NAO_DISPONIVEL'}, row
    assert row['snapshot']['sourceCode'], row
    assert isinstance(row['citations'], list), row
    assert isinstance(row['provenance'], list), row
    overlap=row.get('spatialOverlap')
    if overlap is not None:
        assert isinstance(overlap.get('intersectionAreaM2'), (int,float)), row
        assert isinstance(overlap.get('subjectGeometryAreaM2'), (int,float)), row
        assert 0 <= overlap.get('subjectCoverageRatio', -1) <= 1, row
PY

test "$(curl -sS -o /tmp/ld-api-evidence-notfound -w '%{http_code}' http://127.0.0.1:54000/api/v1/evidence/00000000-0000-0000-0000-000000000000)" = 404

curl -fsS -H 'content-type: application/json' \
  --data '{"query":"query { evidence(municipalityIbge: \"3550308\", subjectType: \"SP_LOT\", subjectId: \"123456789\", limit: 10) { id evidenceType subjectType subjectId status statusLabel snapshot { sourceCode datasetCode } citations { id } provenance { id relationType parentEvidenceId } spatialOverlap { intersectionAreaM2 subjectGeometryAreaM2 subjectCoverageRatio } } }"}' \
  http://127.0.0.1:54000/graphql >/tmp/ld-api-evidence-graphql.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/ld-api-evidence-graphql.json'))
assert 'errors' not in j, j
assert isinstance(j['data']['evidence'], list), j
PY

curl -fsS -H 'content-type: application/json' \
  --data '{"query":"query { sourceSnapshots(municipalityIbge: \"3550308\", limit: 10) { id sourceRegistryId sourceCode datasetCode sha256 ingestedAt parserVersion } }"}' \
  http://127.0.0.1:54000/graphql >/tmp/ld-api-snapshots-graphql.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/ld-api-snapshots-graphql.json'))
assert 'errors' not in j, j
assert isinstance(j['data']['sourceSnapshots'], list), j
PY

curl -fsS http://127.0.0.1:54000/api/docs/openapi.json >/tmp/ld-api-openapi.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/ld-api-openapi.json'))
assert j['openapi']=='3.0.0', j['openapi']
assert '/api/v1/health' in j['paths']
assert '/api/v1/sources' in j['paths']
assert '/api/v1/source-snapshots' in j['paths']
assert '/api/v1/source-snapshots/{id}' in j['paths']
assert '/api/v1/evidence' in j['paths']
assert '/api/v1/evidence/{id}' in j['paths']
assert '/api/v1/properties/{lotId}/terrain/materialization' in j['paths']
assert '/api/v1/properties/{lotId}/terrain/materialize' in j['paths']
assert '/api/v1/properties/{lotId}/terrain/product' in j['paths']
schemas=j.get('components',{}).get('schemas',{})
assert 'SourceRegistryEntry' in schemas, j.get('components')
assert 'SourceSnapshotRecord' in schemas, j.get('components')
assert 'EvidenceRecord' in schemas, j.get('components')
assert 'EvidenceSpatialOverlap' in schemas, j.get('components')
overlap=schemas['EvidenceRecord']['properties'].get('spatialOverlap', {})
assert overlap.get('allOf') or overlap.get('$ref'), overlap
PY


test "$(curl -sS -o /tmp/ld-api-terrain-product-notfound -w '%{http_code}' 'http://127.0.0.1:54000/api/v1/properties/123456789/terrain/product?municipalityIbge=3550308&contourIntervalM=1')" = 404
test "$(curl -sS -o /tmp/ld-api-terrain-product-bad-interval -w '%{http_code}' 'http://127.0.0.1:54000/api/v1/properties/123456789/terrain/product?municipalityIbge=3550308&contourIntervalM=3')" = 400

curl -fsS -D /tmp/ld-api-headers -o /dev/null http://127.0.0.1:54000/api/v1/health
grep -qi '^x-correlation-id:' /tmp/ld-api-headers

"${COMPOSE[@]}" --profile edge up -d --force-recreate caddy >/dev/null
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:58088/healthz >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:58088/api/v1/sources >/tmp/ld-edge-sources.json
curl -fsS 'http://127.0.0.1:58088/api/v1/source-snapshots?limit=1' >/tmp/ld-edge-snapshots.json
curl -fsS 'http://127.0.0.1:58088/api/v1/evidence?limit=1' >/tmp/ld-edge-evidence.json
curl -fsS -H 'content-type: application/json' --data '{"query":"{ sources { sourceCode } sourceSnapshots(limit: 1) { id sha256 } evidence(limit: 1) { id status } }"}' http://127.0.0.1:58088/graphql >/tmp/ld-edge-gql.json
curl -fsS http://127.0.0.1:58088/api/docs/openapi.json >/dev/null
python3 - <<'PY'
import json
assert len(json.load(open('/tmp/ld-edge-sources.json')))==10
assert isinstance(json.load(open('/tmp/ld-edge-snapshots.json')), list)
assert isinstance(json.load(open('/tmp/ld-edge-evidence.json')), list)
gql=json.load(open('/tmp/ld-edge-gql.json'))
assert len(gql['data']['sources'])==10
assert isinstance(gql['data']['sourceSnapshots'], list)
assert isinstance(gql['data']['evidence'], list)
PY

echo 'platform-api-smoke=OK sources=10 snapshots=OK evidence=OK rest=OK graphql=OK openapi=OK correlation=OK edge=OK'
