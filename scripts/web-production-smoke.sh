#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-4210}"
HOST="${HOST:-127.0.0.1}"
BASE_URL="http://$HOST:$PORT"
NODE_ENV=production PORT="$PORT" HOST="$HOST" node server/production.js >/tmp/lotediretor-web-smoke.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -fsS "$BASE_URL/healthz" >/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS "$BASE_URL/healthz" | grep -q '"status":"ok"'

for path in / /about /plano-diretor /rural /condominio /solar /ai-tec /prefeitura /l/lote-sp/6492402; do
  curl -fsS "$BASE_URL$path" | grep -q '<title>LoteDiretor</title>'
done

status="$(curl -sS -o /tmp/lotediretor-api-404.json -w '%{http_code}' "$BASE_URL/api/does-not-exist")"
test "$status" = "404"
grep -q '"error":"Rota não encontrada"' /tmp/lotediretor-api-404.json

echo "web-production-smoke=OK"
