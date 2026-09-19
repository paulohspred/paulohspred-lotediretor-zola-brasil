#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:54000}"
MUNICIPALITY_IBGE="${MUNICIPALITY_IBGE:-3550308}"
AUTO_LOT_ID=0
if [[ -z "${LOT_ID:-}" ]]; then
  LOT_ID="98$(date +%s%N | tail -c 8)"
  AUTO_LOT_ID=1
fi

export LOT_ID MUNICIPALITY_IBGE

cleanup_smoke_job() {
  if [[ "$AUTO_LOT_ID" != "1" || "$BASE_URL" != "http://127.0.0.1:54000" ]]; then
    return
  fi
  local compose=(docker compose -f "$ROOT/platform-v2/infra/docker/compose.yaml" --env-file "$ROOT/platform-v2/.env.example")
  for _ in $(seq 1 40); do
    local status
    status="$("${compose[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -Atc "SELECT coalesce((SELECT status FROM core.property_materialization_job WHERE subject_type='SP_LOT' AND subject_id='$LOT_ID' ORDER BY requested_at DESC LIMIT 1),'NONE');" 2>/dev/null || true)"
    [[ "$status" != "RUNNING" ]] && break
    sleep 0.25
  done
  "${compose[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -v ON_ERROR_STOP=1 -c "DELETE FROM core.terrain_materialization_job WHERE subject_type='SP_LOT' AND subject_id='$LOT_ID'; DELETE FROM core.property_materialization_job WHERE subject_type='SP_LOT' AND subject_id='$LOT_ID';" >/dev/null 2>&1 || true
}
trap cleanup_smoke_job EXIT

curl -fsS "$BASE_URL/api/v1/properties/$LOT_ID/materialization?municipalityIbge=$MUNICIPALITY_IBGE" \
  >/tmp/ld-api-materialization-before.json

python3 - <<'PY'
import json, os
j=json.load(open('/tmp/ld-api-materialization-before.json'))
assert j['municipalityIbge']==os.environ['MUNICIPALITY_IBGE'], j
assert j['subjectType']=='SP_LOT', j
assert j['subjectId']==os.environ['LOT_ID'], j
assert j['status']=='UNREQUESTED', j
assert j['attemptCount']==0, j
PY

status="$(
  curl -sS \
    -o /tmp/ld-api-materialization-queued.json \
    -w '%{http_code}' \
    -X POST \
    "$BASE_URL/api/v1/properties/$LOT_ID/materialize?municipalityIbge=$MUNICIPALITY_IBGE"
)"
test "$status" = "202"

python3 - <<'PY'
import json, os
j=json.load(open('/tmp/ld-api-materialization-queued.json'))
assert j['municipalityIbge']==os.environ['MUNICIPALITY_IBGE'], j
assert j['subjectType']=='SP_LOT', j
assert j['subjectId']==os.environ['LOT_ID'], j
assert j['status']=='QUEUED', j
assert j['attemptCount']==0, j
assert j['maxAttempts']==3, j
assert j['jobId'], j
PY

curl -fsS "$BASE_URL/api/v1/properties/$LOT_ID/materialization?municipalityIbge=$MUNICIPALITY_IBGE" \
  >/tmp/ld-api-materialization-after.json

python3 - <<'PY'
import json, os
j=json.load(open('/tmp/ld-api-materialization-after.json'))
assert j['subjectId']==os.environ['LOT_ID'], j
assert j['status'] in {'QUEUED','RUNNING','FAILED'}, j
assert j['jobId'], j
PY


curl -fsS "$BASE_URL/api/v1/properties/$LOT_ID/terrain/materialization?municipalityIbge=$MUNICIPALITY_IBGE" \
  >/tmp/ld-api-terrain-materialization-before.json

python3 - <<'PY'
import json, os
j=json.load(open('/tmp/ld-api-terrain-materialization-before.json'))
assert j['municipalityIbge']==os.environ['MUNICIPALITY_IBGE'], j
assert j['subjectType']=='SP_LOT', j
assert j['subjectId']==os.environ['LOT_ID'], j
assert j['status']=='UNREQUESTED', j
assert j['evidenceCount']==0, j
PY

terrain_status="$(
  curl -sS \
    -o /tmp/ld-api-terrain-materialization-missing-geometry.json \
    -w '%{http_code}' \
    -X POST \
    "$BASE_URL/api/v1/properties/$LOT_ID/terrain/materialize?municipalityIbge=$MUNICIPALITY_IBGE"
)"
test "$terrain_status" = "404"

python3 - <<'PY'
import json, os
j=json.load(open('/tmp/ld-api-terrain-materialization-missing-geometry.json'))
assert str(os.environ['LOT_ID']) in str(j.get('message','')), j
PY

echo "materialization-api-smoke=OK terrain-prerequisite=OK"
