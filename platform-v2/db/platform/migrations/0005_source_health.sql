BEGIN;

ALTER TABLE core.source_registry
  ADD COLUMN IF NOT EXISTS stale_after interval,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS health_error text;

COMMIT;
