import { createHash } from 'node:crypto';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Pool } from 'pg';

const IDENTITY_PARSER_VERSION = 'geosampa-lot-identity-v1';
const PROPERTIES_PARSER_VERSION = 'geosampa-lot-properties-v1';
const GEOMETRY_PARSER_VERSION = 'geosampa-lot-geometry-v1';
const GEOMETRY_EVIDENCE_TYPE = 'SP_LOT_GEOMETRY';
const GEOMETRY_LOCATOR = 'features[0].geometry';
const SUBJECT_TYPE = 'SP_LOT';

type EvidenceFact = {
  evidenceType: string;
  locator: string;
  valueText: string;
  parserVersion: string;
  unit?: string;
  geometry?: Record<string, unknown>;
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

function extractEvidenceFacts(
  payload: Record<string, unknown>,
  expectedLotId: string,
): { lotId: string; facts: EvidenceFact[] } {
  const features = payload.features;
  if (!Array.isArray(features) || features.length !== 1) {
    throw new Error(`Snapshot expected exactly one lot feature, found ${Array.isArray(features) ? features.length : 0}`);
  }
  const feature = features[0] as Record<string, unknown> | undefined;
  const properties = feature?.properties as Record<string, unknown> | undefined;
  const geometry =
    feature?.geometry && typeof feature.geometry === 'object'
      ? (feature.geometry as Record<string, unknown>)
      : null;
  const lotId = String(properties?.cd_identificador ?? '');
  if (!lotId || lotId !== expectedLotId) {
    throw new Error(`Snapshot lot identifier ${lotId || 'missing'} does not match requested ${expectedLotId}`);
  }

  const facts: EvidenceFact[] = [
    {
      evidenceType: 'SP_LOT_IDENTIFIER',
      locator: 'features[0].properties.cd_identificador',
      valueText: lotId,
      parserVersion: IDENTITY_PARSER_VERSION,
    },
  ];
  const addTextFact = (evidenceType: string, property: string, value: unknown, unit?: string): void => {
    if (value === null || value === undefined || value === '') return;
    facts.push({
      evidenceType,
      locator: `features[0].properties.${property}`,
      valueText: String(value),
      parserVersion: PROPERTIES_PARSER_VERSION,
      ...(unit ? { unit } : {}),
    });
  };

  addTextFact('SP_LOT_FISCAL_SECTOR', 'cd_setor_fiscal', properties?.cd_setor_fiscal);
  addTextFact('SP_LOT_FISCAL_BLOCK', 'cd_quadra_fiscal', properties?.cd_quadra_fiscal);
  addTextFact('SP_LOT_FISCAL_LOT', 'cd_lote', properties?.cd_lote);
  addTextFact('SP_LOT_SQL_DIGIT', 'cd_digito_sql', properties?.cd_digito_sql);
  addTextFact('SP_LOT_CIB', 'cd_cib', properties?.cd_cib);
  addTextFact('SP_LOT_STREET_NAME', 'nm_logradouro_completo', properties?.nm_logradouro_completo);
  addTextFact('SP_LOT_STREET_NUMBER', 'cd_numero_porta', properties?.cd_numero_porta);
  addTextFact('SP_LOT_ADDRESS_COMPLEMENT', 'tx_complemento_endereco', properties?.tx_complemento_endereco);
  addTextFact('SP_LOT_LAND_AREA', 'qt_area_terreno', properties?.qt_area_terreno, 'm²');
  if (geometry) {
    facts.push({
      evidenceType: GEOMETRY_EVIDENCE_TYPE,
      locator: GEOMETRY_LOCATOR,
      valueText: String(geometry.type ?? 'Geometry'),
      parserVersion: GEOMETRY_PARSER_VERSION,
      geometry,
    });
  }

  return { lotId, facts };
}

function metadataText(snapshot: SnapshotRow, key: string): string | null {
  const value = snapshot.metadata?.[key];
  return typeof value === 'string' && value ? value : null;
}

async function persistEvidence(
  pool: Pool,
  snapshot: SnapshotRow,
  lotId: string,
  fact: EvidenceFact,
): Promise<{ id: string; created: boolean; citationCreated: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const identity = `${snapshot.id}:${fact.evidenceType}:${SUBJECT_TYPE}:${lotId}:${fact.parserVersion}`;
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
      [snapshot.id, fact.evidenceType, SUBJECT_TYPE, lotId, fact.locator, fact.parserVersion],
    );
    let evidenceId = existing.rows[0]?.id;
    const created = !evidenceId;
    if (!evidenceId) {
      const inserted = await client.query<EvidenceRow>(
        `INSERT INTO evidence.evidence (
           source_snapshot_id, evidence_type, subject_type, subject_id,
           locator, value_text, unit, geometry, status, parser_version, metadata
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6, $7,
           CASE WHEN $8::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($8), 4326) END,
           'CONFIRMADO', $9, $10::jsonb
         )
         RETURNING id::text`,
        [
          snapshot.id,
          fact.evidenceType,
          SUBJECT_TYPE,
          lotId,
          fact.locator,
          fact.valueText,
          fact.unit ?? null,
          fact.geometry ? JSON.stringify(fact.geometry) : null,
          fact.parserVersion,
          JSON.stringify({
            sourceCode: snapshot.source_code,
            datasetCode: snapshot.dataset_code,
            contentSha256: snapshot.sha256,
            canonicalSha256: metadataText(snapshot, 'canonicalSha256'),
          }),
        ],
      );
      evidenceId = inserted.rows[0]?.id;
    }
    if (!evidenceId) throw new Error('Evidence insert did not return an id');

    const citationUrl = metadataText(snapshot, 'requestUrl');
    const citationExisting = await client.query<{ id: string }>(
      `SELECT id::text
       FROM evidence.citation
       WHERE evidence_id = $1::uuid
         AND source_locator = $2
         AND COALESCE(source_url, '') = COALESCE($3, '')
       LIMIT 1`,
      [evidenceId, fact.locator, citationUrl],
    );
    const citationCreated = citationExisting.rowCount === 0;
    if (citationCreated) {
      await client.query(
        `INSERT INTO evidence.citation (
           evidence_id, source_url, document_title, source_locator, quoted_text
         ) VALUES ($1::uuid, $2, $3, $4, $5)`,
        [evidenceId, citationUrl, 'GeoSampa — lote_cidadao', fact.locator, fact.valueText],
      );
    }
    await client.query('COMMIT');
    return { id: evidenceId, created, citationCreated };
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
    application_name: 'lotediretor-geosampa-lot-parser',
    max: 2,
  });
  const s3 = createS3Client();
  const bucket = process.env.S3_SOURCE_BUCKET ?? 'sources';
  try {
    const snapshot = await loadSnapshot(pool, snapshotId);
    const requestedLotId = metadataText(snapshot, 'requestedLotId');
    if (!requestedLotId || !/^\d+$/.test(requestedLotId)) {
      throw new Error(`Snapshot ${snapshotId} is missing requestedLotId metadata`);
    }
    const payload = await readVerifiedJson(s3, bucket, snapshot);
    const { lotId, facts } = extractEvidenceFacts(payload, requestedLotId);
    const persisted = [];
    for (const fact of facts) {
      const result = await persistEvidence(pool, snapshot, lotId, fact);
      persisted.push({ fact, ...result });
    }
    const identity = persisted.find((item) => item.fact.evidenceType === 'SP_LOT_IDENTIFIER');
    if (!identity) throw new Error('Lot identifier evidence was not persisted');
    process.stdout.write(
      `${JSON.stringify({
        status: 'ok',
        snapshotId: snapshot.id,
        sourceCode: snapshot.source_code,
        subjectType: SUBJECT_TYPE,
        subjectId: lotId,
        evidenceId: identity.id,
        evidenceType: identity.fact.evidenceType,
        evidenceStatus: 'CONFIRMADO',
        parserVersion: identity.fact.parserVersion,
        created: identity.created,
        citationCreated: identity.citationCreated,
        evidenceCount: persisted.length,
        createdCount: persisted.filter((item) => item.created).length,
        citationCreatedCount: persisted.filter((item) => item.citationCreated).length,
        evidenceTypes: persisted.map((item) => item.fact.evidenceType),
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
