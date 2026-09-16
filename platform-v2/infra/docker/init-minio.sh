#!/bin/sh
set -eu
for i in $(seq 1 30); do
  if mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
for bucket in sources reports uploads; do
  mc mb --ignore-existing "local/$bucket" >/dev/null
done
mc ls local
