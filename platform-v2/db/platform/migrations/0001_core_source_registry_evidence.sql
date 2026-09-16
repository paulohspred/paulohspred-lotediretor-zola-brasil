BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS evidence;

CREATE TABLE IF NOT EXISTS core.state (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  ibge_code text NOT NULL UNIQUE,
  name text NOT NULL,
  abbreviation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.municipality (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  state_id uuid NOT NULL REFERENCES core.state(id),
  ibge_code text NOT NULL UNIQUE,
  name text NOT NULL,
  timezone text,
  boundary geometry(MultiPolygon, 4326),
  valid_from date,
  valid_to date,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz
);

CREATE INDEX IF NOT EXISTS municipality_boundary_gix
  ON core.municipality USING gist (boundary);

CREATE TABLE IF NOT EXISTS core.source_registry (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  municipality_id uuid REFERENCES core.municipality(id),
  source_code text NOT NULL,
  source_type text NOT NULL,
  authority text NOT NULL,
  dataset_code text NOT NULL,
  access_class text NOT NULL CHECK (access_class IN ('A','B','C','D','E','F')),
  parser_version text,
  ingestion_status text NOT NULL DEFAULT 'manual'
    CHECK (ingestion_status IN ('healthy','degraded','broken','manual','disabled')),
  cadence text,
  valid_from date,
  valid_to date,
  last_checked_at timestamptz,
  last_source_update timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, source_code, dataset_code)
);

CREATE TABLE IF NOT EXISTS core.source_endpoint (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  source_registry_id uuid NOT NULL REFERENCES core.source_registry(id) ON DELETE CASCADE,
  endpoint_type text NOT NULL,
  url text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  secret_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_registry_id, endpoint_type, url)
);

CREATE TABLE IF NOT EXISTS core.source_license (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  source_registry_id uuid NOT NULL REFERENCES core.source_registry(id) ON DELETE CASCADE,
  license_name text,
  terms_url text,
  usage_notes text,
  redistribution_allowed boolean,
  commercial_use_allowed boolean,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.source_coverage (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  source_registry_id uuid NOT NULL REFERENCES core.source_registry(id) ON DELETE CASCADE,
  municipality_id uuid REFERENCES core.municipality(id),
  coverage geometry(MultiPolygon, 4326),
  coverage_status text NOT NULL DEFAULT 'unknown',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from date,
  valid_to date,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_coverage_gix
  ON core.source_coverage USING gist (coverage);

CREATE TABLE IF NOT EXISTS core.source_snapshot (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  source_registry_id uuid NOT NULL REFERENCES core.source_registry(id),
  object_key text NOT NULL,
  sha256 char(64) NOT NULL,
  media_type text,
  byte_size bigint,
  source_published_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  parser_version text,
  schema_fingerprint text,
  feature_count bigint,
  bbox geometry(Polygon, 4326),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_registry_id, sha256)
);

CREATE INDEX IF NOT EXISTS source_snapshot_bbox_gix
  ON core.source_snapshot USING gist (bbox);

CREATE TABLE IF NOT EXISTS evidence.evidence (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  source_snapshot_id uuid NOT NULL REFERENCES core.source_snapshot(id),
  evidence_type text NOT NULL,
  locator text,
  value_text text,
  value_json jsonb,
  unit text,
  status text NOT NULL CHECK (
    status IN ('CONFIRMADO','CALCULADO','INFERIDO','PENDENTE','CONFLITANTE','NAO_DISPONIVEL')
  ),
  valid_from timestamptz,
  valid_to timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  geometry geometry(Geometry, 4326),
  calculation_method text,
  parser_version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS evidence_geometry_gix
  ON evidence.evidence USING gist (geometry);
CREATE INDEX IF NOT EXISTS evidence_snapshot_idx
  ON evidence.evidence (source_snapshot_id);

CREATE TABLE IF NOT EXISTS evidence.citation (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  evidence_id uuid NOT NULL REFERENCES evidence.evidence(id) ON DELETE CASCADE,
  source_url text,
  document_title text,
  source_locator text,
  quoted_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence.quality_assessment (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  evidence_id uuid NOT NULL REFERENCES evidence.evidence(id) ON DELETE CASCADE,
  geometry_quality text,
  temporal_quality text,
  source_quality text,
  confidence numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  notes text,
  assessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence.conflict (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  conflict_key text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEW','RESOLVED','ACCEPTED')),
  summary text NOT NULL,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS evidence.provenance_link (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  evidence_id uuid NOT NULL REFERENCES evidence.evidence(id) ON DELETE CASCADE,
  parent_evidence_id uuid REFERENCES evidence.evidence(id),
  relation_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_evidence_id IS NULL OR parent_evidence_id <> evidence_id)
);

COMMIT;
