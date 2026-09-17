#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example)
LOT_SOURCE='TEST_GEOSAMPA_LOT_GEOMETRY_TERRITORIAL'
TERRITORIAL_SOURCE='TEST_GEOSAMPA_TERRITORIAL'
LOT_ID='6492402'
PORT=58996
TMP_DIR="$(mktemp -d /tmp/ld-geosampa-territorial-smoke.XXXXXX)"
HTTP_PID=''

cleanup() {
  if [[ -n "$HTTP_PID" ]]; then kill "$HTTP_PID" 2>/dev/null || true; fi
  "${COMPOSE[@]}" --profile bootstrap run --rm --entrypoint /bin/sh minio-init -lc \
    "mc alias set local http://minio:9000 \"\$MINIO_ROOT_USER\" \"\$MINIO_ROOT_PASSWORD\" >/dev/null && mc rm --recursive --force 'local/sources/raw/${TERRITORIAL_SOURCE}' >/dev/null 2>&1 || true" >/dev/null 2>&1 || true
  "${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL || true
DELETE FROM evidence.provenance_link WHERE evidence_id IN (SELECT id FROM evidence.evidence WHERE subject_type='SP_LOT' AND subject_id='${LOT_ID}' AND source_snapshot_id IN (SELECT ss.id FROM core.source_snapshot ss JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code IN ('${LOT_SOURCE}','${TERRITORIAL_SOURCE}')));
DELETE FROM evidence.citation WHERE evidence_id IN (SELECT id FROM evidence.evidence WHERE subject_type='SP_LOT' AND subject_id='${LOT_ID}' AND source_snapshot_id IN (SELECT ss.id FROM core.source_snapshot ss JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code IN ('${LOT_SOURCE}','${TERRITORIAL_SOURCE}')));
DELETE FROM evidence.evidence WHERE subject_type='SP_LOT' AND subject_id='${LOT_ID}' AND source_snapshot_id IN (SELECT ss.id FROM core.source_snapshot ss JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code IN ('${LOT_SOURCE}','${TERRITORIAL_SOURCE}'));
DELETE FROM core.source_snapshot WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code IN ('${LOT_SOURCE}','${TERRITORIAL_SOURCE}'));
DELETE FROM core.source_endpoint WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code IN ('${LOT_SOURCE}','${TERRITORIAL_SOURCE}'));
DELETE FROM core.source_registry WHERE source_code IN ('${LOT_SOURCE}','${TERRITORIAL_SOURCE}');
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
from urllib.parse import parse_qs, urlparse
import json, os
PORT=int(os.environ['PORT'])
OVERLAP={'type':'Polygon','coordinates':[[[-46.50220,-23.57960],[-46.50200,-23.57960],[-46.50200,-23.57940],[-46.50220,-23.57940],[-46.50220,-23.57960]]]}
OUTSIDE={'type':'Polygon','coordinates':[[[-46.50300,-23.58000],[-46.50280,-23.58000],[-46.50280,-23.57980],[-46.50300,-23.57980],[-46.50300,-23.58000]]]}
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query=parse_qs(urlparse(self.path).query)
        type_name=(query.get('typeNames') or [''])[0]
        if type_name.endswith('pde2014_v_mcrz_01_map'):
            features=[
                {'type':'Feature','id':'pde2014_v_mcrz_01_map.1','geometry':OVERLAP,'properties':{'cd_identificador':1,'sg_macro_divisao_pde':'MZURB','nm_perimetro_divisao_pde':'Macrozona de Estruturacao e Qualificacao Urbana','tx_macro_divisao_pde':'Macrozona de Estruturação e Qualificação Urbana'}},
                {'type':'Feature','id':'pde2014_v_mcrz_01_map.2','geometry':OUTSIDE,'properties':{'cd_identificador':2,'sg_macro_divisao_pde':'MZAMB','nm_perimetro_divisao_pde':'Macrozona de Protecao e Recuperacao Ambiental','tx_macro_divisao_pde':'Macrozona de Proteção e Recuperação Ambiental'}}
            ]
        elif type_name.endswith('pde_macroarea_lei_18209'):
            features=[
                {'type':'Feature','id':'pde_macroarea_lei_18209.1','geometry':OVERLAP,'properties':{'cd_identificador_pde_macroarea_lei_18209':1,'sg_macroarea':'MQU','nm_macroarea':'Macroarea de Qualificacao da Urbanizacao','dt_atualizacao':'2025-03-27Z'}},
                {'type':'Feature','id':'pde_macroarea_lei_18209.2','geometry':OUTSIDE,'properties':{'cd_identificador_pde_macroarea_lei_18209':2,'sg_macroarea':'MEM','nm_macroarea':'Macroarea de Estruturacao Metropolitana','dt_atualizacao':'2025-03-27Z'}}
            ]
        elif type_name.endswith('risco_hidrologico'):
            features=[
                {'type':'Feature','id':'risco_hidrologico.427','geometry':OVERLAP,'properties':{'cd_identificador_risco_hidrologico':427,'nm_area_risco_hidrologico':'ARRAIAS DO ARAGUAIA','tx_grau_risco_hidrologico':'R1','tx_tipo_processo':'ALAGAMENTO','nm_bacia_hidrografica':'RIO ARICANDUVA','dt_vistoria':'2022-03-31Z'}},
                {'type':'Feature','id':'risco_hidrologico.999','geometry':OUTSIDE,'properties':{'cd_identificador_risco_hidrologico':999,'nm_area_risco_hidrologico':'FORA DO LOTE','tx_grau_risco_hidrologico':'R2','tx_tipo_processo':'INUNDACAO','nm_bacia_hidrografica':'RIO TESTE','dt_vistoria':'2022-04-01Z'}}
            ]
        else:
            features=[]
        body=json.dumps({'type':'FeatureCollection','features':features,'numberMatched':len(features),'numberReturned':len(features),'timeStamp':datetime.now(timezone.utc).isoformat()},separators=(',',':'),ensure_ascii=False).encode()
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
SELECT id, '${TERRITORIAL_SOURCE}', 'WFS', 'LoteDiretor CI territorial fixture', 'TERRITORIAL_SMOKE', 'F', 'geosampa-layer-v1', 'manual', 'healthy'
FROM core.municipality WHERE ibge_code='3550308';
INSERT INTO core.source_endpoint (source_registry_id, endpoint_type, url, method)
SELECT id, 'WFS', 'http://host.docker.internal:${PORT}/ows', 'GET' FROM core.source_registry WHERE source_code='${TERRITORIAL_SOURCE}';
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

run_layer() {
  local layer="$1" expected_code="$2" expected_type="$3"
  local first="$TMP_DIR/${layer}-ingest-first.json" second="$TMP_DIR/${layer}-ingest-second.json"
  local parse_first="$TMP_DIR/${layer}-parse-first.json" parse_second="$TMP_DIR/${layer}-parse-second.json"
  local ingest=("${COMPOSE[@]}" --profile ingest run --rm --entrypoint node data-pipelines workers/data-pipelines/dist/ingest-geosampa-territorial-snapshot.js --source-code "$TERRITORIAL_SOURCE" --municipality-ibge 3550308 --layer-key "$layer" --lot-id "$LOT_ID")
  "${ingest[@]}" >"$first"
  sleep 0.02
  "${ingest[@]}" >"$second"
  python3 - "$first" "$second" "$layer" <<'PY'
import json,sys
first=json.load(open(sys.argv[1])); second=json.load(open(sys.argv[2])); layer=sys.argv[3]
assert first['layerKey']==layer and second['layerKey']==layer, (first,second)
assert first['created'] is True and first['objectCreated'] is True, first
assert second['created'] is False and second['objectCreated'] is False, second
assert first['candidateCount']==2 and second['candidateCount']==2, (first,second)
assert second['snapshotId']==first['snapshotId'], (first,second)
assert second['canonicalSha256']==first['canonicalSha256'], (first,second)
assert second['fetchedSha256']!=first['fetchedSha256'], 'fixture timestamp should change raw hash'
assert first['lotGeometryEvidenceId']==second['lotGeometryEvidenceId'], (first,second)
PY
  local snapshot_id
  snapshot_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["snapshotId"])' "$first")"
  local parse=("${COMPOSE[@]}" --profile ingest run --rm --entrypoint node data-pipelines workers/data-pipelines/dist/parse-geosampa-territorial-snapshot.js --snapshot-id "$snapshot_id")
  "${parse[@]}" >"$parse_first"
  "${parse[@]}" >"$parse_second"
  python3 - "$parse_first" "$parse_second" "$layer" "$expected_code" "$expected_type" <<'PY'
import json,sys
first=json.load(open(sys.argv[1])); second=json.load(open(sys.argv[2])); layer,code,etype=sys.argv[3:]
assert first['layerKey']==layer and first['evidenceType']==etype, first
assert first['candidateCount']==2 and first['evidenceCount']==1, first
assert first['codes']==[code], first
assert first['createdCount']==1 and first['citationCreatedCount']==1 and first['provenanceCreatedCount']==1, first
assert second['evidenceCount']==1 and second['createdCount']==0, second
assert second['citationCreatedCount']==0 and second['provenanceCreatedCount']==0, second
assert first['evidenceStatus']=='CALCULADO' and first['sha256Verified'] is True, first
PY
}

run_layer macrozona MZURB SP_LOT_MACROZONA_INTERSECTION
run_layer macroarea MQU SP_LOT_MACROAREA_INTERSECTION
run_layer risco_hidrologico R1 SP_LOT_HYDROLOGICAL_RISK_INTERSECTION

COUNTS="$("${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -Atc "SELECT (SELECT count(*) FROM core.source_snapshot ss JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${TERRITORIAL_SOURCE}') || ':' || (SELECT count(*) FROM evidence.evidence e JOIN core.source_snapshot ss ON ss.id=e.source_snapshot_id JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${TERRITORIAL_SOURCE}' AND e.evidence_type IN ('SP_LOT_MACROZONA_INTERSECTION','SP_LOT_MACROAREA_INTERSECTION','SP_LOT_HYDROLOGICAL_RISK_INTERSECTION')) || ':' || (SELECT count(*) FROM evidence.citation c JOIN evidence.evidence e ON e.id=c.evidence_id JOIN core.source_snapshot ss ON ss.id=e.source_snapshot_id JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${TERRITORIAL_SOURCE}') || ':' || (SELECT count(*) FROM evidence.provenance_link p JOIN evidence.evidence e ON e.id=p.evidence_id JOIN core.source_snapshot ss ON ss.id=e.source_snapshot_id JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${TERRITORIAL_SOURCE}' AND p.relation_type='SPATIAL_INTERSECTION_INPUT');")"
test "$COUNTS" = '3:3:3:3'

COVERAGE="$("${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -Atc "SELECT string_agg(e.value_text || ':' || round((e.metadata->>'shareOfLotGeometry')::numeric,4)::text, ',' ORDER BY e.value_text) FROM evidence.evidence e JOIN core.source_snapshot ss ON ss.id=e.source_snapshot_id JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${TERRITORIAL_SOURCE}' AND e.evidence_type IN ('SP_LOT_MACROZONA_INTERSECTION','SP_LOT_MACROAREA_INTERSECTION','SP_LOT_HYDROLOGICAL_RISK_INTERSECTION');")"
test "$COVERAGE" = 'MQU:1.0000,MZURB:1.0000,R1:1.0000'

RISK_META="$("${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -Atc "SELECT (e.metadata #>> '{sourceProperties,nm_bacia_hidrografica}') || ':' || (e.metadata #>> '{sourceProperties,nm_area_risco_hidrologico}') FROM evidence.evidence e JOIN core.source_snapshot ss ON ss.id=e.source_snapshot_id JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${TERRITORIAL_SOURCE}' AND e.evidence_type='SP_LOT_HYDROLOGICAL_RISK_INTERSECTION';")"
test "$RISK_META" = 'RIO ARICANDUVA:ARRAIAS DO ARAGUAIA'

echo 'geosampa-territorial-evidence-smoke=OK layers=macrozona,macroarea,risco_hidrologico semantic-idempotency=OK exact-overlap=OK provenance=OK source-metadata=OK'
