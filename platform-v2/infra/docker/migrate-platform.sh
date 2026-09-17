#!/bin/sh
set -eu
for migration in /migrations/*.sql; do
  echo "Applying ${migration}"
  psql -h postgres -U "${POSTGRES_USER:-lotediretor}" -d "${POSTGRES_DB:-lotediretor_platform}" -v ON_ERROR_STOP=1 -f "$migration"
done
psql -h postgres -U "${POSTGRES_USER:-lotediretor}" -d "${POSTGRES_DB:-lotediretor_platform}" -v ON_ERROR_STOP=1 -f /seeds/sao-paulo-source-registry.sql
