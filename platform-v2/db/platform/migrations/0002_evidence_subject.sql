BEGIN;

ALTER TABLE evidence.evidence
  ADD COLUMN IF NOT EXISTS subject_type text,
  ADD COLUMN IF NOT EXISTS subject_id text;

CREATE INDEX IF NOT EXISTS evidence_subject_idx
  ON evidence.evidence (subject_type, subject_id);

COMMIT;
