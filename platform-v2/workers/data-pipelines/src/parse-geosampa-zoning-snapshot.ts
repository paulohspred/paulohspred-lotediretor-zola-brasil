import { createHash } from 'node:crypto';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Pool } from 'pg';
import { ensureSpatialIntegrityAssessment } from './spatial-integrity-assessment.js';

const PARSER_VERSION = 'geosampa-zoning-intersection-v1';
const EVIDENCE_TYPE = 'SP_LOT_ZONING_INTERSECTION';
const SUBJECT_TYPE = 'SP_LOT';
const CALCULATION_METHOD =
  'PostGIS ST_Intersection on EPSG:4326 versioned lot and zoning geometries; positive 2D overlap only';

type ZoningCandidate = {
  featureId: string;
  geometry: Record<string, unknown>;
  zoneCode: string;
  zoneName: string | null;
  observation: string | null;
  lawType: string | null;
  lawNumber: string | null;
  lawYear: string | null;
  updatedAt: string | null;
  locator: string;
};

type IntersectionMetrics = {
  dimension: number;
  intersectionAreaM2: number;
  lotGeometryAreaM2: number;
};

type SnapshotRow = {
  id: string;
  object_key: string;
  sha256: string;
  media_type: string | null;
  metadata: Record<string, unknown> | null;
  source_code: string;
  dataset_code: string;
};

type EvidenceRow = { id: string };

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function createS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:59000',
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? 'lotediretor',
      secretAccessKey:
        process.env.S3_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? 'change-me-minio-secret',
    },
  });
}

async function loadSnapshot(pool: Pool, snapshotId: string): Promise<SnapshotRow> {
  const result = await pool.query<SnapshotRow>(
    `SELECT ss.id::text, ss.object_key, ss.sha256, ss.media_type, ss.metadata,
            sr.source_code, sr.dataset_code
     FROM core.source_snapshot ss
     JOIN core.source_registry sr ON sr.id = ss.source_registry_id
     WHERE ss.id = $1::uuid`,
    [snapshotId],
  );
  const snapshot = result.rows[0];
  if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);
  if (!['application/json', 'application/geo+json'].includes(snapshot.media_type ?? '')) {
    throw new Error(`Snapshot ${snapshotId} media type is ${snapshot.media_type ?? 'unknown'}, expected JSON`);
  }
  return snapshot;
}

async function readVerifiedJson(s3: S3Client, bucket: string, snapshot: SnapshotRow): Promise<Record<string, unknown>> {
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: snapshot.object_key }));
  if (!object.Body) throw new Error(`Snapshot object is empty: ${snapshot.object_key}`);
  const bytes = Buffer.from(await object.Body.transformToByteArray());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== snapshot.sha256) {
    throw new Error(`Snapshot SHA-256 mismatch: database=${snapshot.sha256} object=${sha256}`);
  }
  try {
    return JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error(`Snapshot ${snapshot.id} contains invalid JSON`);
  }
}

function extractCandidates(payload: Record<string, unknown>): ZoningCandidate[] {
  const features = payload.features;
  if (!Array.isArray(features)) throw new Error('Snapshot has no zoning features array');
  return features.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Invalid zoning feature at index ${index}`);
    const feature = raw as Record<string, unknown>;
    const properties = feature.properties as Record<string, unknown> | undefined;
    const geometry = feature.geometry as Record<string, unknown> | undefined;
    if (!properties || !geometry) throw new Error(`Zoning feature ${index} is missing properties or geometry`);
    const featureId = typeof feature.id === 'string' ? feature.id : `index-${index}`;
    const zoneCode = String(properties.cd_zoneamento_perimetro ?? '').trim();
    if (!zoneCode) throw new Error(`Zoning feature ${featureId} is missing cd_zoneamento_perimetro`);
    const text = (value: unknown): string | null =>
      value === null || value === undefined || value === '' ? null : String(value);
    return {
      featureId,
      geometry,
      zoneCode,
      zoneName: text(properties.tx_zoneamento_perimetro),
      observation: text(properties.tx_observacao_perimetro),
      lawType: text(properties.cd_tipo_legislacao_zoneamento),
      lawNumber: text(properties.cd_numero_legislacao_zoneamento),
      lawYear: text(properties.an_legislacao_zoneamento),
      updatedAt: text(properties.dt_atualizacao),
      locator: `feature:${featureId}.properties.cd_zoneamento_perimetro`,
    };
  });
}

async function measureIntersection(
  pool: Pool,
  lotGeometryEvidenceId: string,
  lotId: string,
  candidate: ZoningCandidate,
): Promise<IntersectionMetrics> {
  const result = await pool.query<{
    dimension: number;
    intersection_area_m2: string;
    lot_geometry_area_m2: string;
  }>(
    `WITH input AS (
       SELECT geometry AS lot_geometry,
              ST_SetSRID(ST_GeomFromGeoJSON($2), 4326) AS zoning_geometry
       FROM evidence.evidence
       WHERE id = $1::uuid
         AND subject_type = 'SP_LOT'
         AND subject_id = $3
         AND evidence_type = 'SP_LOT_GEOMETRY'
         AND status = 'CONFIRMADO'
         AND geometry IS NOT NULL
     ), overlap AS (
       SELECT lot_geometry,
              ST_Intersection(lot_geometry, zoning_geometry) AS intersection_geometry
       FROM input
     )
     SELECT ST_Dimension(intersection_geometry) AS dimension,
            ST_Area(intersection_geometry::geography)::text AS intersection_area_m2,
            ST_Area(lot_geometry::geography)::text AS lot_geometry_area_m2
     FROM overlap`,
    [lotGeometryEvidenceId, JSON.stringify(candidate.geometry), lotId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Lot geometry evidence not found: ${lotGeometryEvidenceId}`);
  return {
    dimension: Number(row.dimension),
    intersectionAreaM2: Number(row.intersection_area_m2),
    lotGeometryAreaM2: Number(row.lot_geometry_area_m2),
  };
}

function metadataText(snapshot: SnapshotRow, key: string): string | null {
  const value = snapshot.metadata?.[key];
  return typeof value === 'string' && value ? value : null;
}

async function persistEvidence(
  pool: Pool,
  snapshot: SnapshotRow,
  lotId: string,
  lotGeometryEvidenceId: string,
  candidate: ZoningCandidate,
  metrics: IntersectionMetrics,
): Promise<{ id: string; created: boolean; citationCreated: boolean; provenanceCreated: boolean; qualityAssessmentCreated: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const identity = `${snapshot.id}:${candidate.featureId}:${SUBJECT_TYPE}:${lotId}:${PARSER_VERSION}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identity]);
    const existing = await client.query<EvidenceRow>(
      `SELECT id::text
       FROM evidence.evidence
       WHERE source_snapshot_id = $1::uuid
         AND evidence_type = $2
         AND subject_type = $3
         AND subject_id = $4
         AND locator = $5
         AND parser_version = $6
       LIMIT 1`,
      [snapshot.id, EVIDENCE_TYPE, SUBJECT_TYPE, lotId, candidate.locator, PARSER_VERSION],
    );
    let evidenceId = existing.rows[0]?.id;
    const created = !evidenceId;
    if (!evidenceId) {
      const inserted = await client.query<EvidenceRow>(
        `INSERT INTO evidence.evidence (
           source_snapshot_id, evidence_type, subject_type, subject_id,
           locator, value_text, status, calculation_method, parser_version, metadata
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, 'CALCULADO', $7, $8, $9::jsonb)
         RETURNING id::text`,
        [
          snapshot.id,
          EVIDENCE_TYPE,
          SUBJECT_TYPE,
          lotId,
          candidate.locator,
          candidate.zoneCode,
          CALCULATION_METHOD,
          PARSER_VERSION,
          JSON.stringify({
            sourceCode: snapshot.source_code,
            datasetCode: snapshot.dataset_code,
            contentSha256: snapshot.sha256,
            canonicalSha256: metadataText(snapshot, 'canonicalSha256'),
            zoningFeatureId: candidate.featureId,
            zoneName: candidate.zoneName,
            observation: candidate.observation,
            lawType: candidate.lawType,
            lawNumber: candidate.lawNumber,
            lawYear: candidate.lawYear,
            sourceUpdatedAt: candidate.updatedAt,
            lotGeometryEvidenceId,
            intersectionAreaM2: metrics.intersectionAreaM2,
            lotGeometryAreaM2: metrics.lotGeometryAreaM2,
            shareOfLotGeometry:
              metrics.lotGeometryAreaM2 > 0
                ? metrics.intersectionAreaM2 / metrics.lotGeometryAreaM2
                : null,
          }),
        ],
      );
      evidenceId = inserted.rows[0]?.id;
    }
    if (!evidenceId) throw new Error('Zoning evidence insert did not return an id');

    const citationUrl = metadataText(snapshot, 'requestUrl');
    const citationExisting = await client.query<{ id: string }>(
      `SELECT id::text
       FROM evidence.citation
       WHERE evidence_id = $1::uuid
         AND source_locator = $2
         AND COALESCE(source_url, '') = COALESCE($3, '')
       LIMIT 1`,
      [evidenceId, candidate.locator, citationUrl],
    );
    const citationCreated = citationExisting.rowCount === 0;
    if (citationCreated) {
      await client.query(
        `INSERT INTO evidence.citation (
           evidence_id, source_url, document_title, source_locator, quoted_text
         ) VALUES ($1::uuid, $2, $3, $4, $5)`,
        [
          evidenceId,
          citationUrl,
          'GeoSampa — perimetro_zona_lei_18177_24',
          candidate.locator,
          candidate.zoneName ? `${candidate.zoneCode} — ${candidate.zoneName}` : candidate.zoneCode,
        ],
      );
    }

    const provenanceExisting = await client.query<{ id: string }>(
      `SELECT id::text
       FROM evidence.provenance_link
       WHERE evidence_id = $1::uuid
         AND parent_evidence_id = $2::uuid
         AND relation_type = 'SPATIAL_INTERSECTION_INPUT'
       LIMIT 1`,
      [evidenceId, lotGeometryEvidenceId],
    );
    const provenanceCreated = provenanceExisting.rowCount === 0;
    if (provenanceCreated) {
      await client.query(
        `INSERT INTO evidence.provenance_link (evidence_id, parent_evidence_id, relation_type)
         VALUES ($1::uuid, $2::uuid, 'SPATIAL_INTERSECTION_INPUT')`,
        [evidenceId, lotGeometryEvidenceId],
      );
    }
    const qualityAssessmentCreated = await ensureSpatialIntegrityAssessment(client, evidenceId);
    await client.query('COMMIT');
    return {
      id: evidenceId,
      created,
      citationCreated,
      provenanceCreated,
      qualityAssessmentCreated,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const snapshotId = readArg('snapshot-id');
  if (!snapshotId) throw new Error('Missing required --snapshot-id');
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      'postgres://lotediretor:change-me-platform-db@127.0.0.1:55432/lotediretor_platform',
    application_name: 'lotediretor-geosampa-zoning-parser',
    max: 2,
  });
  const s3 = createS3Client();
  const bucket = process.env.S3_SOURCE_BUCKET ?? 'sources';
  try {
    const snapshot = await loadSnapshot(pool, snapshotId);
    const requestedLotId = metadataText(snapshot, 'requestedLotId');
    const lotGeometryEvidenceId = metadataText(snapshot, 'lotGeometryEvidenceId');
    if (!requestedLotId || !/^\d+$/.test(requestedLotId)) {
      throw new Error(`Snapshot ${snapshotId} is missing requestedLotId metadata`);
    }
    if (!lotGeometryEvidenceId) {
      throw new Error(`Snapshot ${snapshotId} is missing lotGeometryEvidenceId metadata`);
    }
    const payload = await readVerifiedJson(s3, bucket, snapshot);
    const candidates = extractCandidates(payload);
    const persisted = [];
    for (const candidate of candidates) {
      const metrics = await measureIntersection(
        pool,
        lotGeometryEvidenceId,
        requestedLotId,
        candidate,
      );
      if (metrics.dimension !== 2 || metrics.intersectionAreaM2 <= 0) continue;
      const result = await persistEvidence(
        pool,
        snapshot,
        requestedLotId,
        lotGeometryEvidenceId,
        candidate,
        metrics,
      );
      persisted.push({ candidate, metrics, ...result });
    }
    process.stdout.write(
      `${JSON.stringify({
        status: 'ok',
        snapshotId: snapshot.id,
        sourceCode: snapshot.source_code,
        subjectType: SUBJECT_TYPE,
        subjectId: requestedLotId,
        evidenceType: EVIDENCE_TYPE,
        evidenceStatus: 'CALCULADO',
        parserVersion: PARSER_VERSION,
        candidateCount: candidates.length,
        evidenceCount: persisted.length,
        createdCount: persisted.filter((item) => item.created).length,
        citationCreatedCount: persisted.filter((item) => item.citationCreated).length,
        provenanceCreatedCount: persisted.filter((item) => item.provenanceCreated).length,
        qualityAssessmentCreatedCount: persisted.filter((item) => item.qualityAssessmentCreated).length,
        zoneCodes: persisted.map((item) => item.candidate.zoneCode),
        sha256Verified: true,
      })}\n`,
    );
  } finally {
    await pool.end();
    s3.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
