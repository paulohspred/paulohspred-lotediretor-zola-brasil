#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example)
SOURCE_CODE='TEST_GEOSAMPA_LOT'
LOT_ID='6492402'
PORT=58998
TMP_DIR="$(mktemp -d /tmp/ld-geosampa-lot-smoke.XXXXXX)"
HTTP_PID=''

cleanup() {
  if [[ -n "$HTTP_PID" ]]; then kill "$HTTP_PID" 2>/dev/null || true; fi
  "${COMPOSE[@]}" --profile bootstrap run --rm --entrypoint /bin/sh minio-init -lc \
    "mc alias set local http://minio:9000 \"\$MINIO_ROOT_USER\" \"\$MINIO_ROOT_PASSWORD\" >/dev/null && mc rm --recursive --force 'local/sources/raw/${SOURCE_CODE}' >/dev/null 2>&1 || true" >/dev/null 2>&1 || true
  "${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL || true
DELETE FROM evidence.provenance_link WHERE evidence_id IN (SELECT id FROM evidence.evidence WHERE source_snapshot_id IN (SELECT id FROM core.source_snapshot WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code = '${SOURCE_CODE}')));
DELETE FROM evidence.citation WHERE evidence_id IN (SELECT id FROM evidence.evidence WHERE source_snapshot_id IN (SELECT id FROM core.source_snapshot WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code = '${SOURCE_CODE}')));
DELETE FROM evidence.quality_assessment WHERE evidence_id IN (SELECT id FROM evidence.evidence WHERE source_snapshot_id IN (SELECT id FROM core.source_snapshot WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code = '${SOURCE_CODE}')));
DELETE FROM evidence.evidence WHERE source_snapshot_id IN (SELECT id FROM core.source_snapshot WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code = '${SOURCE_CODE}'));
DELETE FROM core.source_snapshot WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code = '${SOURCE_CODE}');
DELETE FROM core.source_endpoint WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code = '${SOURCE_CODE}');
DELETE FROM core.source_registry WHERE source_code = '${SOURCE_CODE}';
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
LOT_ID=int(os.environ['LOT_ID'])
PORT=int(os.environ['PORT'])
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body=json.dumps({
            'type':'FeatureCollection',
            'features':[{
                'type':'Feature','id':f'lote_cidadao.{LOT_ID}',
                'geometry':{'type':'Polygon','coordinates':[[[-46.5022,-23.5796],[-46.5020,-23.5796],[-46.5020,-23.5794],[-46.5022,-23.5794],[-46.5022,-23.5796]]]},
                'properties':{
                    'cd_identificador':LOT_ID,
                    'cd_setor_fiscal':'148','cd_quadra_fiscal':'063','cd_lote':'0024','cd_digito_sql':'0',
                    'cd_cib':None,'nm_logradouro_completo':'AV ARRAIAS DO ARAGUAIA','cd_numero_porta':'95',
                    'tx_complemento_endereco':None,'qt_area_terreno':250.0
                }
            }],
            'totalFeatures':1,'numberMatched':1,'numberReturned':1,
            'timeStamp':datetime.now(timezone.utc).isoformat()
        },separators=(',',':')).encode()
        self.send_response(200)
        self.send_header('Content-Type','application/json;charset=UTF-8')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def log_message(self, *_args): pass
HTTPServer(('0.0.0.0',PORT),Handler).serve_forever()
PY
LOT_ID="$LOT_ID" PORT="$PORT" python3 "$TMP_DIR/server.py" >"$TMP_DIR/http.log" 2>&1 &
HTTP_PID=$!
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/ows" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
curl -fsS "http://127.0.0.1:${PORT}/ows" >/dev/null

"${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -v ON_ERROR_STOP=1 >/dev/null <<SQL
INSERT INTO core.source_registry (
  municipality_id, source_code, source_type, authority, dataset_code,
  access_class, parser_version, cadence, ingestion_status
)
SELECT id, '${SOURCE_CODE}', 'WFS', 'LoteDiretor CI GeoSampa fixture', 'LOTE_FISCAL_SMOKE',
       'F', 'geosampa-lote-v1', 'manual', 'healthy'
FROM core.municipality WHERE ibge_code = '3550308'
ON CONFLICT (municipality_id, source_code, dataset_code) DO NOTHING;
INSERT INTO core.source_endpoint (source_registry_id, endpoint_type, url, method)
SELECT id, 'WFS', 'http://host.docker.internal:${PORT}/ows', 'GET'
FROM core.source_registry WHERE source_code = '${SOURCE_CODE}'
ON CONFLICT (source_registry_id, endpoint_type, url) DO UPDATE SET enabled = true;
SQL

"${COMPOSE[@]}" --profile ingest build data-pipelines >/dev/null
RUN=("${COMPOSE[@]}" --profile ingest run --rm --entrypoint node data-pipelines workers/data-pipelines/dist/ingest-geosampa-lot-snapshot.js --source-code "$SOURCE_CODE" --municipality-ibge 3550308 --lot-id "$LOT_ID")
"${RUN[@]}" >"$TMP_DIR/first.json"
sleep 0.02
"${RUN[@]}" >"$TMP_DIR/second.json"

python3 - "$TMP_DIR/first.json" "$TMP_DIR/second.json" <<'PY'
import json,sys
first=json.load(open(sys.argv[1])); second=json.load(open(sys.argv[2]))
assert first['created'] is True and first['objectCreated'] is True, first
assert second['created'] is False and second['objectCreated'] is False, second
assert second['snapshotId']==first['snapshotId'], (first,second)
assert second['canonicalSha256']==first['canonicalSha256'], (first,second)
assert second['sha256']==first['sha256'], (first,second)
assert second['fetchedSha256']!=first['fetchedSha256'], 'fixture timestamp should make raw fetch hashes differ'
assert first['subjectType']=='SP_LOT' and first['subjectId']=='6492402', first
PY

SNAPSHOT_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["snapshotId"])' "$TMP_DIR/first.json")"
PARSE=("${COMPOSE[@]}" --profile ingest run --rm --entrypoint node data-pipelines workers/data-pipelines/dist/parse-geosampa-lot-snapshot.js --snapshot-id "$SNAPSHOT_ID")
"${PARSE[@]}" >"$TMP_DIR/parser-first.json"
"${PARSE[@]}" >"$TMP_DIR/parser-second.json"
python3 - "$TMP_DIR/parser-first.json" "$TMP_DIR/parser-second.json" <<'PY'
import json,sys
first=json.load(open(sys.argv[1])); second=json.load(open(sys.argv[2]))
assert first['created'] is True and first['citationCreated'] is True, first
assert second['created'] is False and second['citationCreated'] is False, second
assert second['evidenceId']==first['evidenceId'], (first,second)
assert first['subjectType']=='SP_LOT' and first['subjectId']=='6492402', first
assert first['evidenceType']=='SP_LOT_IDENTIFIER' and first['evidenceStatus']=='CONFIRMADO', first
assert first['evidenceCount']==9 and first['createdCount']==9 and first['citationCreatedCount']==9, first
assert second['evidenceCount']==9 and second['createdCount']==0 and second['citationCreatedCount']==0, second
assert set(first['evidenceTypes'])=={
    'SP_LOT_IDENTIFIER','SP_LOT_FISCAL_SECTOR','SP_LOT_FISCAL_BLOCK','SP_LOT_FISCAL_LOT',
    'SP_LOT_SQL_DIGIT','SP_LOT_STREET_NAME','SP_LOT_STREET_NUMBER','SP_LOT_LAND_AREA','SP_LOT_GEOMETRY'
}, first
assert first['sha256Verified'] is True, first
PY

COUNTS="$("${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -Atc "SELECT (SELECT count(*) FROM core.source_snapshot ss JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${SOURCE_CODE}') || ':' || (SELECT count(*) FROM evidence.evidence e JOIN core.source_snapshot ss ON ss.id=e.source_snapshot_id JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${SOURCE_CODE}' AND e.subject_type='SP_LOT' AND e.subject_id='${LOT_ID}') || ':' || (SELECT count(*) FROM evidence.citation c JOIN evidence.evidence e ON e.id=c.evidence_id JOIN core.source_snapshot ss ON ss.id=e.source_snapshot_id JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${SOURCE_CODE}');")"
test "$COUNTS" = '1:9:9'

echo 'geosampa-lot-evidence-smoke=OK semantic-idempotency=OK subject=OK evidence-fields=8 geometry=OK citation=OK'
