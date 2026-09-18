BEGIN;

CREATE TABLE IF NOT EXISTS core.terrain_materialization_job (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  municipality_id uuid NOT NULL REFERENCES core.municipality(id),
  subject_type text NOT NULL DEFAULT 'SP_LOT',
  subject_id text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  requested_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  worker_id text,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS terrain_materialization_job_active_uq
  ON core.terrain_materialization_job (municipality_id, subject_type, subject_id)
  WHERE status IN ('QUEUED','RUNNING');

CREATE INDEX IF NOT EXISTS terrain_materialization_job_queue_idx
  ON core.terrain_materialization_job (status, next_attempt_at, requested_at);

CREATE INDEX IF NOT EXISTS terrain_materialization_job_subject_idx
  ON core.terrain_materialization_job (subject_type, subject_id, requested_at DESC);

COMMIT;
