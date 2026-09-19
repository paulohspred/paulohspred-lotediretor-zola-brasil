#!/usr/bin/env bash
set -euo pipefail

backup="${1:?Usage: verify-platform-v2-backup.sh /path/to/backup}"
dump="$(find "$backup/postgres" -maxdepth 1 -type f -name '*.dump' -print -quit)"

[[ -n "$dump" && -f "$dump" ]]
[[ -f "$backup/SHA256SUMS" ]]

(
  cd "$backup"
  sha256sum -c SHA256SUMS
)

docker compose   -f "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/platform-v2/infra/docker/compose.yaml"   --env-file "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/platform-v2/.env"   exec -T postgres pg_restore -l < "$dump" >/dev/null

echo "backup verification: OK"
