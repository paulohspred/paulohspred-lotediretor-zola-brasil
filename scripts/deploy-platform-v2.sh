#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/platform-v2/.env}"
COMPOSE_FILE="$ROOT/platform-v2/infra/docker/compose.yaml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing private environment file: $ENV_FILE" >&2
  exit 2
fi

compose=(sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

"${compose[@]}" config >/dev/null
"${compose[@]}" build platform-api materialization-worker terrain-materialization-worker
"${compose[@]}" --profile migrate run --rm migrate-platform
"${compose[@]}" --profile bootstrap run --rm minio-init
"${compose[@]}" up -d --force-recreate   postgres valkey nats minio martin   platform-api materialization-worker terrain-materialization-worker

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:54000/api/v1/health >/tmp/lotediretor-platform-health.json 2>/dev/null; then
    cat /tmp/lotediretor-platform-health.json
    printf '\n'
    exit 0
  fi
  sleep 1
done

"${compose[@]}" ps
"${compose[@]}" logs --tail=100 platform-api materialization-worker terrain-materialization-worker
exit 1
