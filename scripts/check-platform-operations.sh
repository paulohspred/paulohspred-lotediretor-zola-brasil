#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/platform-v2/.env}"
COMPOSE_FILE="$ROOT/platform-v2/infra/docker/compose.yaml"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-85}"

[[ -f "$ENV_FILE" ]] || { echo "missing env: $ENV_FILE" >&2; exit 2; }

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

curl -fsS http://127.0.0.1:4200/healthz >/dev/null
curl -fsS http://127.0.0.1:54000/api/v1/health >/dev/null

disk_used="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
if (( disk_used >= DISK_WARN_PERCENT )); then
  echo "root filesystem usage too high: ${disk_used}%" >&2
  exit 1
fi

compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

read -r stale_property stale_terrain broken_sources <<EOF2
$("${compose[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F ' ' -c "
SELECT
  (SELECT count(*) FROM core.property_materialization_job
    WHERE status='RUNNING' AND updated_at < now() - interval '20 minutes'),
  (SELECT count(*) FROM core.terrain_materialization_job
    WHERE status='RUNNING' AND updated_at < now() - interval '45 minutes'),
  (SELECT count(*) FROM core.source_registry WHERE ingestion_status='broken');
")
EOF2

if (( stale_property > 0 || stale_terrain > 0 || broken_sources > 0 )); then
  echo "operational health failed: stale_property=$stale_property stale_terrain=$stale_terrain broken_sources=$broken_sources" >&2
  exit 1
fi

echo "operations-health=OK disk=${disk_used}% stale_property=$stale_property stale_terrain=$stale_terrain broken_sources=$broken_sources"
