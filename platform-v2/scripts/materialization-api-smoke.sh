#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:54000}"
LOT_ID="${LOT_ID:-123456789}"
MUNICIPALITY_IBGE="${MUNICIPALITY_IBGE:-3550308}"

export LOT_ID MUNICIPALITY_IBGE

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
assert j['status']=='QUEUED', j
assert j['jobId'], j
PY

echo "materialization-api-smoke=OK"
