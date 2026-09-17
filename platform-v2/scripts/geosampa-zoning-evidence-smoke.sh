#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example)
LOT_SOURCE='TEST_GEOSAMPA_LOT_GEOMETRY'
ZONING_SOURCE='TEST_GEOSAMPA_ZONING'
LOT_ID='6492402'
PORT=58997
TMP_DIR="$(mktemp -d /tmp/ld-geosampa-zoning-smoke.XXXXXX)"
HTTP_PID=''

cleanup() {
  if [[ -n "$HTTP_PID" ]]; then kill "$HTTP_PID" 2>/dev/null || true; fi
  "${COMPOSE[@]}" --profile bootstrap run --rm --entrypoint /bin/sh minio-init -lc \
    "mc alias set local http://minio:9000 \"\$MINIO_ROOT_USER\" \"\$MINIO_ROOT_PASSWORD\" >/dev/null && mc rm --recursive --force 'local/sources/raw/${ZONING_SOURCE}' >/dev/null 2>&1 || true" >/dev/null 2>&1 || true
  "${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL || true
DELETE FROM evidence.provenance_link WHERE evidence_id IN (SELECT id FROM evidence.evidence WHERE subject_type='SP_LOT' AND subject_id='${LOT_ID}' AND source_snapshot_id IN (SELECT ss.id FROM core.source_snapshot ss JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code IN ('${LOT_SOURCE}','${ZONING_SOURCE}')));
DELETE FROM evidence.citation WHERE evidence_id IN (SELECT id FROM evidence.evidence WHERE subject_type='SP_LOT' AND subject_id='${LOT_ID}' AND source_snapshot_id IN (SELECT ss.id FROM core.source_snapshot ss JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code IN ('${LOT_SOURCE}','${ZONING_SOURCE}')));
DELETE FROM evidence.evidence WHERE subject_type='SP_LOT' AND subject_id='${LOT_ID}' AND source_snapshot_id IN (SELECT ss.id FROM core.source_snapshot ss JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code IN ('${LOT_SOURCE}','${ZONING_SOURCE}'));
DELETE FROM core.source_snapshot WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code IN ('${LOT_SOURCE}','${ZONING_SOURCE}'));
DELETE FROM core.source_endpoint WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code IN ('${LOT_SOURCE}','${ZONING_SOURCE}'));
DELETE FROM core.source_registry WHERE source_code IN ('${LOT_SOURCE}','${ZONING_SOURCE}');
SQL
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

"${COMPOSE[@]}" up -d postgres minio >/dev/null
"${COMPOSE[@]}" --profile migrate run --rm migrate-platform >/dev/null
"${COMPOSE[@]}" --profile bootstrap run --rm minio-init >/dev/null

cat > "$TMP_DIR/server.py" <<'PY'
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
import json, os
PORT=int(os.environ['PORT'])
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body=json.dumps({
            'type':'FeatureCollection',
            'features':[
                {
                    'type':'Feature','id':'perimetro_zona_lei_18177_24.1',
                    'geometry':{'type':'Polygon','coordinates':[[[-46.50220,-23.57960],[-46.50208,-23.57960],[-46.50208,-23.57940],[-46.50220,-23.57940],[-46.50220,-23.57960]]]},
                    'properties':{
                        'cd_identificador':1,'tx_zoneamento_perimetro':'Zona Especial de Interesse Social 1',
                        'tx_observacao_perimetro':None,'cd_zoneamento_perimetro':'ZEIS-1',
                        'cd_tipo_legislacao_zoneamento':'L','cd_numero_legislacao_zoneamento':18177,
                        'an_legislacao_zoneamento':2024,'dt_atualizacao':'2025-03-28T03:00:00Z'
                    }
                },
                {
                    'type':'Feature','id':'perimetro_zona_lei_18177_24.2',
                    'geometry':{'type':'Polygon','coordinates':[[[-46.50300,-23.58000],[-46.50280,-23.58000],[-46.50280,-23.57980],[-46.50300,-23.57980],[-46.50300,-23.58000]]]},
                    'properties':{
                        'cd_identificador':2,'tx_zoneamento_perimetro':'Zona Predominantemente Industrial 1',
                        'tx_observacao_perimetro':None,'cd_zoneamento_perimetro':'ZPI-1',
                        'cd_tipo_legislacao_zoneamento':'L','cd_numero_legislacao_zoneamento':18177,
                        'an_legislacao_zoneamento':2024,'dt_atualizacao':'2025-03-28T03:00:00Z'
                    }
                }
            ],
            'numberMatched':2,'numberReturned':2,'timeStamp':datetime.now(timezone.utc).isoformat()
        },separators=(',',':')).encode()
        self.send_response(200)
        self.send_header('Content-Type','application/json;charset=UTF-8')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def log_message(self, *_args): pass
HTTPServer(('0.0.0.0',PORT),Handler).serve_forever()
PY
PORT="$PORT" python3 "$TMP_DIR/server.py" >"$TMP_DIR/http.log" 2>&1 &
HTTP_PID=$!
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/ows" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
curl -fsS "http://127.0.0.1:${PORT}/ows" >/dev/null

"${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -v ON_ERROR_STOP=1 >/dev/null <<SQL
INSERT INTO core.source_registry (municipality_id, source_code, source_type, authority, dataset_code, access_class, parser_version, cadence, ingestion_status)
SELECT id, '${LOT_SOURCE}', 'WFS', 'LoteDiretor CI lot geometry fixture', 'LOT_GEOMETRY_SMOKE', 'F', 'smoke-v1', 'manual', 'healthy'
FROM core.municipality WHERE ibge_code='3550308';
INSERT INTO core.source_registry (municipality_id, source_code, source_type, authority, dataset_code, access_class, parser_version, cadence, ingestion_status)
SELECT id, '${ZONING_SOURCE}', 'WFS', 'LoteDiretor CI zoning fixture', 'ZONEAMENTO_SMOKE', 'F', 'geosampa-zone-v1', 'manual', 'healthy'
FROM core.municipality WHERE ibge_code='3550308';
INSERT INTO core.source_endpoint (source_registry_id, endpoint_type, url, method)
SELECT id, 'WFS', 'http://host.docker.internal:${PORT}/ows', 'GET' FROM core.source_registry WHERE source_code='${ZONING_SOURCE}';
INSERT INTO core.source_snapshot (source_registry_id, object_key, sha256, media_type, byte_size, parser_version, feature_count, metadata)
SELECT id, 'smoke/lot-geometry', repeat('0',64), 'application/geo+json', 0, 'smoke-v1', 1, '{}'::jsonb
FROM core.source_registry WHERE source_code='${LOT_SOURCE}';
INSERT INTO evidence.evidence (source_snapshot_id, evidence_type, subject_type, subject_id, locator, value_text, geometry, status, parser_version)
SELECT ss.id, 'SP_LOT_GEOMETRY', 'SP_LOT', '${LOT_ID}', 'features[0].geometry', 'Polygon',
       ST_GeomFromText('POLYGON((-46.50220 -23.57960,-46.50200 -23.57960,-46.50200 -23.57940,-46.50220 -23.57940,-46.50220 -23.57960))',4326),
       'CONFIRMADO', 'smoke-v1'
FROM core.source_snapshot ss JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${LOT_SOURCE}';
SQL

"${COMPOSE[@]}" --profile ingest build data-pipelines >/dev/null
INGEST=("${COMPOSE[@]}" --profile ingest run --rm --entrypoint node data-pipelines workers/data-pipelines/dist/ingest-geosampa-zoning-snapshot.js --source-code "$ZONING_SOURCE" --municipality-ibge 3550308 --lot-id "$LOT_ID")
"${INGEST[@]}" >"$TMP_DIR/ingest-first.json"
sleep 0.02
"${INGEST[@]}" >"$TMP_DIR/ingest-second.json"
python3 - "$TMP_DIR/ingest-first.json" "$TMP_DIR/ingest-second.json" <<'PY'
import json,sys
first=json.load(open(sys.argv[1])); second=json.load(open(sys.argv[2]))
assert first['created'] is True and first['objectCreated'] is True, first
assert second['created'] is False and second['objectCreated'] is False, second
assert first['candidateCount']==2 and second['candidateCount']==2, (first,second)
assert second['snapshotId']==first['snapshotId'], (first,second)
assert second['canonicalSha256']==first['canonicalSha256'], (first,second)
assert second['fetchedSha256']!=first['fetchedSha256'], 'fixture timestamp should change raw hash'
assert first['lotGeometryEvidenceId']==second['lotGeometryEvidenceId'], (first,second)
PY

SNAPSHOT_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["snapshotId"])' "$TMP_DIR/ingest-first.json")"
PARSE=("${COMPOSE[@]}" --profile ingest run --rm --entrypoint node data-pipelines workers/data-pipelines/dist/parse-geosampa-zoning-snapshot.js --snapshot-id "$SNAPSHOT_ID")
"${PARSE[@]}" >"$TMP_DIR/parse-first.json"
"${PARSE[@]}" >"$TMP_DIR/parse-second.json"
python3 - "$TMP_DIR/parse-first.json" "$TMP_DIR/parse-second.json" <<'PY'
import json,sys
first=json.load(open(sys.argv[1])); second=json.load(open(sys.argv[2]))
assert first['candidateCount']==2 and first['evidenceCount']==1, first
assert first['zoneCodes']==['ZEIS-1'], first
assert first['createdCount']==1 and first['citationCreatedCount']==1 and first['provenanceCreatedCount']==1, first
assert second['evidenceCount']==1 and second['createdCount']==0, second
assert second['citationCreatedCount']==0 and second['provenanceCreatedCount']==0, second
assert first['evidenceStatus']=='CALCULADO' and first['sha256Verified'] is True, first
PY

COUNTS="$("${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -Atc "SELECT (SELECT count(*) FROM core.source_snapshot ss JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${ZONING_SOURCE}') || ':' || (SELECT count(*) FROM evidence.evidence e JOIN core.source_snapshot ss ON ss.id=e.source_snapshot_id JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${ZONING_SOURCE}' AND e.evidence_type='SP_LOT_ZONING_INTERSECTION') || ':' || (SELECT count(*) FROM evidence.citation c JOIN evidence.evidence e ON e.id=c.evidence_id JOIN core.source_snapshot ss ON ss.id=e.source_snapshot_id JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${ZONING_SOURCE}') || ':' || (SELECT count(*) FROM evidence.provenance_link p JOIN evidence.evidence e ON e.id=p.evidence_id JOIN core.source_snapshot ss ON ss.id=e.source_snapshot_id JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${ZONING_SOURCE}' AND p.relation_type='SPATIAL_INTERSECTION_INPUT');")"
test "$COUNTS" = '1:1:1:1'

echo 'geosampa-zoning-evidence-smoke=OK semantic-idempotency=OK exact-overlap=OK provenance=OK'
