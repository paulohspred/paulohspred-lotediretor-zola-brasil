#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example)
SOURCE_CODE='TEST_SNAPSHOT_INGEST'
PORT=58999
TMP_DIR="$(mktemp -d /tmp/ld-snapshot-smoke.XXXXXX)"
HTTP_PID=''
SHA=''

cleanup() {
  if [[ -n "$HTTP_PID" ]]; then kill "$HTTP_PID" 2>/dev/null || true; fi
  if [[ -n "$SHA" ]]; then
    "${COMPOSE[@]}" --profile bootstrap run --rm --entrypoint /bin/sh minio-init -lc \
      "mc alias set local http://minio:9000 \"\$MINIO_ROOT_USER\" \"\$MINIO_ROOT_PASSWORD\" >/dev/null && mc rm --force 'local/sources/raw/${SOURCE_CODE}/${SHA}' >/dev/null 2>&1 || true" >/dev/null 2>&1 || true
  fi
  "${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL || true
DELETE FROM evidence.provenance_link WHERE evidence_id IN (SELECT id FROM evidence.evidence WHERE source_snapshot_id IN (SELECT id FROM core.source_snapshot WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code = '${SOURCE_CODE}')));
DELETE FROM evidence.citation WHERE evidence_id IN (SELECT id FROM evidence.evidence WHERE source_snapshot_id IN (SELECT id FROM core.source_snapshot WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code = '${SOURCE_CODE}')));
DELETE FROM evidence.quality_assessment WHERE evidence_id IN (SELECT id FROM evidence.evidence WHERE source_snapshot_id IN (SELECT id FROM core.source_snapshot WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code = '${SOURCE_CODE}')));
DELETE FROM evidence.evidence WHERE source_snapshot_id IN (SELECT id FROM core.source_snapshot WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code = '${SOURCE_CODE}'));
DELETE FROM core.source_snapshot WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code = '${SOURCE_CODE}');
DELETE FROM core.source_endpoint WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code = '${SOURCE_CODE}');
DELETE FROM core.source_license WHERE source_registry_id IN (SELECT id FROM core.source_registry WHERE source_code = '${SOURCE_CODE}');
DELETE FROM core.source_registry WHERE source_code = '${SOURCE_CODE}';
SQL
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

"${COMPOSE[@]}" up -d postgres minio >/dev/null
"${COMPOSE[@]}" --profile migrate run --rm migrate-platform >/dev/null
"${COMPOSE[@]}" --profile bootstrap run --rm minio-init >/dev/null

printf '%s\n' '<!doctype html><html><head><title>Snapshot Smoke &amp; Evidence</title></head><body>fixture</body></html>' > "$TMP_DIR/source.html"
SHA="$(sha256sum "$TMP_DIR/source.html" | awk '{print $1}')"
python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$TMP_DIR" >"$TMP_DIR/http.log" 2>&1 &
HTTP_PID=$!
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/source.html" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
curl -fsS "http://127.0.0.1:${PORT}/source.html" >/dev/null

"${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -v ON_ERROR_STOP=1 >/dev/null <<SQL
INSERT INTO core.source_registry (
  municipality_id, source_code, source_type, authority, dataset_code,
  access_class, parser_version, cadence, ingestion_status
)
SELECT id, '${SOURCE_CODE}', 'TEST', 'LoteDiretor CI', 'SNAPSHOT_SMOKE',
       'F', 'snapshot-smoke-v1', 'manual', 'healthy'
FROM core.municipality WHERE ibge_code = '3550308'
ON CONFLICT (municipality_id, source_code, dataset_code) DO NOTHING;

INSERT INTO core.source_endpoint (source_registry_id, endpoint_type, url, method)
SELECT id, 'TEST_HTTP', 'http://host.docker.internal:${PORT}/source.html', 'GET'
FROM core.source_registry WHERE source_code = '${SOURCE_CODE}'
ON CONFLICT (source_registry_id, endpoint_type, url) DO UPDATE SET enabled = true;
SQL

"${COMPOSE[@]}" --profile ingest build data-pipelines >/dev/null
"${COMPOSE[@]}" --profile ingest run --rm data-pipelines \
  --source-code "$SOURCE_CODE" --municipality-ibge 3550308 >"$TMP_DIR/first.json"
"${COMPOSE[@]}" --profile ingest run --rm data-pipelines \
  --source-code "$SOURCE_CODE" --municipality-ibge 3550308 >"$TMP_DIR/second.json"

python3 - "$TMP_DIR/first.json" "$TMP_DIR/second.json" "$SHA" <<'PY'
import json,sys
first=json.load(open(sys.argv[1]))
second=json.load(open(sys.argv[2]))
sha=sys.argv[3]
assert first['status']=='ok', first
assert first['created'] is True, first
assert first['objectCreated'] is True, first
assert first['sha256']==sha, first
assert second['status']=='ok', second
assert second['created'] is False, second
assert second['objectCreated'] is False, second
assert second['snapshotId']==first['snapshotId'], (first,second)
assert second['sha256']==sha, second
PY

COUNT="$("${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -Atc "SELECT count(*) FROM core.source_snapshot ss JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${SOURCE_CODE}' AND ss.sha256='${SHA}';")"
test "$COUNT" = '1'

SNAPSHOT_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["snapshotId"])' "$TMP_DIR/first.json")"

"${COMPOSE[@]}" --profile ingest run --rm --entrypoint node data-pipelines \
  workers/data-pipelines/dist/parse-html-snapshot.js --snapshot-id "$SNAPSHOT_ID" >"$TMP_DIR/parser-first.json"
"${COMPOSE[@]}" --profile ingest run --rm --entrypoint node data-pipelines \
  workers/data-pipelines/dist/parse-html-snapshot.js --snapshot-id "$SNAPSHOT_ID" >"$TMP_DIR/parser-second.json"

python3 - "$TMP_DIR/parser-first.json" "$TMP_DIR/parser-second.json" <<'PY'
import json,sys
first=json.load(open(sys.argv[1]))
second=json.load(open(sys.argv[2]))
assert first['status']=='ok', first
assert first['evidenceType']=='SOURCE_DOCUMENT_TITLE', first
assert first['evidenceStatus']=='CONFIRMADO', first
assert first['parserVersion']=='html-metadata-v1', first
assert first['created'] is True, first
assert first['citationCreated'] is True, first
assert first['sha256Verified'] is True, first
assert first['title']=='Snapshot Smoke & Evidence', first
assert second['created'] is False, second
assert second['citationCreated'] is False, second
assert second['evidenceId']==first['evidenceId'], (first,second)
PY

EVIDENCE_COUNT="$("${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -Atc "SELECT count(*) FROM evidence.evidence e JOIN core.source_snapshot ss ON ss.id=e.source_snapshot_id JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${SOURCE_CODE}' AND e.evidence_type='SOURCE_DOCUMENT_TITLE';")"
test "$EVIDENCE_COUNT" = '1'
CITATION_COUNT="$("${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -Atc "SELECT count(*) FROM evidence.citation c JOIN evidence.evidence e ON e.id=c.evidence_id JOIN core.source_snapshot ss ON ss.id=e.source_snapshot_id JOIN core.source_registry sr ON sr.id=ss.source_registry_id WHERE sr.source_code='${SOURCE_CODE}' AND e.evidence_type='SOURCE_DOCUMENT_TITLE';")"
test "$CITATION_COUNT" = '1'

"${COMPOSE[@]}" --profile bootstrap run --rm --entrypoint /bin/sh minio-init -lc \
  "mc alias set local http://minio:9000 \"\$MINIO_ROOT_USER\" \"\$MINIO_ROOT_PASSWORD\" >/dev/null && mc stat 'local/sources/raw/${SOURCE_CODE}/${SHA}' >/dev/null"

echo "source-snapshot-ingest-smoke=OK idempotent=OK sha256=${SHA} object=OK evidence=OK citation=OK"
