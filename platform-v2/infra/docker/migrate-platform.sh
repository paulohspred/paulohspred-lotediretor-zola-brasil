#!/bin/sh
set -eu
psql -h postgres -U "${POSTGRES_USER:-lotediretor}" -d "${POSTGRES_DB:-lotediretor_platform}" -v ON_ERROR_STOP=1 -f /migrations/0001_core_source_registry_evidence.sql
psql -h postgres -U "${POSTGRES_USER:-lotediretor}" -d "${POSTGRES_DB:-lotediretor_platform}" -v ON_ERROR_STOP=1 -f /seeds/sao-paulo-source-registry.sql
