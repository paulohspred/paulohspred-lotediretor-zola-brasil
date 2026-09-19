#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example)

python3 -m json.tool platform-v2/data/schemas/source-registry.schema.json >/dev/null
"${COMPOSE[@]}" --profile migrate --profile bootstrap --profile identity --profile search --profile observability --profile edge --profile health config >/dev/null

"${COMPOSE[@]}" up -d postgres valkey nats minio
"${COMPOSE[@]}" --profile migrate run --rm migrate-platform >/dev/null
"${COMPOSE[@]}" --profile bootstrap run --rm minio-init >/dev/null
"${COMPOSE[@]}" up -d martin

sources=$("${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -Atc 'SELECT count(*) FROM core.source_registry;')
[ "$sources" = "11" ] || { echo "expected 11 São Paulo sources, got $sources" >&2; exit 1; }

stale_policies=$("${COMPOSE[@]}" exec -T postgres psql -U lotediretor -d lotediretor_platform -Atc 'SELECT count(*) FROM core.source_registry WHERE stale_after IS NOT NULL;')
[ "$stale_policies" = "11" ] || { echo "expected 11 staleness policies, got $stale_policies" >&2; exit 1; }

"${COMPOSE[@]}" exec -T valkey valkey-cli ping | grep -q PONG
curl -fsS http://127.0.0.1:58222/healthz | grep -q '"status":"ok"'
curl -fsS http://127.0.0.1:59000/minio/health/live >/dev/null
curl -fsS http://127.0.0.1:53000/catalog >/dev/null

echo "foundation-smoke=OK sources=$sources"
