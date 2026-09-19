#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/platform-v2/.env}"
BACKUP_ROOT="${BACKUP_ROOT:-/srv/lotediretor-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
COMPOSE_FILE="$ROOT/platform-v2/infra/docker/compose.yaml"
MC_IMAGE="quay.io/minio/mc@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing production env file: $ENV_FILE" >&2
  exit 2
fi

umask 077
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${POSTGRES_USER:?POSTGRES_USER required}"
: "${POSTGRES_DB:?POSTGRES_DB required}"
: "${MINIO_ROOT_USER:?MINIO_ROOT_USER required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD required}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_ROOT/$timestamp"
mkdir -p "$target/postgres" "$target/minio"
chmod 700 "$BACKUP_ROOT" "$target"

compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

{
  echo "created_at=$timestamp"
  echo "git_sha=$(git -C "$ROOT" rev-parse HEAD)"
  echo "hostname=$(hostname)"
  echo "db_dump_format=postgres-custom"
  echo "minio_backup=logical-mirror"
} > "$target/metadata.txt"

"${compose[@]}" exec -T postgres   pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc   > "$target/postgres/${POSTGRES_DB}.dump"

"${compose[@]}" exec -T postgres   pg_restore -l   < "$target/postgres/${POSTGRES_DB}.dump"   > "$target/postgres/restore.list"

docker run --rm   --network lotediretor-v2_foundation   --entrypoint /bin/sh   -e MINIO_ROOT_USER   -e MINIO_ROOT_PASSWORD   -v "$target/minio:/backup"   "$MC_IMAGE"   -c 'mc alias set ld http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null &&
      for bucket in sources reports uploads; do
        mkdir -p "/backup/$bucket"
        mc mirror --overwrite "ld/$bucket" "/backup/$bucket" >/dev/null
      done'

(
  cd "$target"
  find . -type f ! -name SHA256SUMS ! -name verify.txt -print0     | sort -z     | xargs -0 sha256sum > SHA256SUMS
  sha256sum -c SHA256SUMS > verify.txt
)

ln -sfn "$target" "$BACKUP_ROOT/latest"

if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d     -name '20??????T??????Z' -mtime "+$RETENTION_DAYS" -print -exec rm -rf -- {} +
fi

echo "backup=$target"
echo "size=$(du -sh "$target" | cut -f1)"
echo "files=$(find "$target" -type f | wc -l)"
