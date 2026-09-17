import { createHash } from 'node:crypto';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { load } from 'cheerio';
import { Pool } from 'pg';

const PARSER_VERSION = 'html-metadata-v1';
const EVIDENCE_TYPE = 'SOURCE_DOCUMENT_TITLE';
const LOCATOR = 'html:title';

type SnapshotRow = {
  id: string;
  object_key: string;
  sha256: string;
  media_type: string | null;
  metadata: Record<string, unknown> | null;
  source_code: string;
  dataset_code: string;
  authority: string;
  municipality_ibge: string | null;
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
    `SELECT
       ss.id::text,
       ss.object_key,
       ss.sha256,
       ss.media_type,
       ss.metadata,
       sr.source_code,
       sr.dataset_code,
       sr.authority,
       m.ibge_code AS municipality_ibge
     FROM core.source_snapshot ss
     JOIN core.source_registry sr ON sr.id = ss.source_registry_id
     LEFT JOIN core.municipality m ON m.id = sr.municipality_id
     WHERE ss.id = $1::uuid`,
    [snapshotId],
  );
  const snapshot = result.rows[0];
  if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);
  if (snapshot.media_type !== 'text/html') {
    throw new Error(`Snapshot ${snapshotId} media type is ${snapshot.media_type ?? 'unknown'}, expected text/html`);
  }
  return snapshot;
}

async function readVerifiedHtml(s3: S3Client, bucket: string, snapshot: SnapshotRow): Promise<string> {
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: snapshot.object_key }));
  if (!object.Body) throw new Error(`Snapshot object is empty: ${snapshot.object_key}`);
  const bytes = Buffer.from(await object.Body.transformToByteArray());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== snapshot.sha256) {
    throw new Error(`Snapshot SHA-256 mismatch: database=${snapshot.sha256} object=${sha256}`);
  }
  return bytes.toString('utf8');
}

function sourceUrl(snapshot: SnapshotRow, canonicalUrl?: string): string | null {
  if (canonicalUrl) return canonicalUrl;
  const finalUrl = snapshot.metadata?.finalUrl;
  if (typeof finalUrl === 'string' && finalUrl) return finalUrl;
  const originalUrl = snapshot.metadata?.sourceUrl;
  return typeof originalUrl === 'string' && originalUrl ? originalUrl : null;
}

async function persistTitleEvidence(
  pool: Pool,
  snapshot: SnapshotRow,
  title: string,
  citationUrl: string | null,
): Promise<{ id: string; created: boolean; citationCreated: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const identity = `${snapshot.id}:${EVIDENCE_TYPE}:${LOCATOR}:${PARSER_VERSION}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identity]);

    const existing = await client.query<EvidenceRow>(
      `SELECT id::text
       FROM evidence.evidence
       WHERE source_snapshot_id = $1::uuid
         AND evidence_type = $2
         AND locator = $3
         AND parser_version = $4
       LIMIT 1`,
      [snapshot.id, EVIDENCE_TYPE, LOCATOR, PARSER_VERSION],
    );

    let evidenceId = existing.rows[0]?.id;
    const created = !evidenceId;
    if (!evidenceId) {
      const inserted = await client.query<EvidenceRow>(
        `INSERT INTO evidence.evidence (
           source_snapshot_id, evidence_type, locator, value_text, status,
           parser_version, metadata
         ) VALUES ($1::uuid, $2, $3, $4, 'CONFIRMADO', $5, $6::jsonb)
         RETURNING id::text`,
        [
          snapshot.id,
          EVIDENCE_TYPE,
          LOCATOR,
          title,
          PARSER_VERSION,
          JSON.stringify({
            sourceCode: snapshot.source_code,
            datasetCode: snapshot.dataset_code,
            contentSha256: snapshot.sha256,
          }),
        ],
      );
      evidenceId = inserted.rows[0]?.id;
    }
    if (!evidenceId) throw new Error('Evidence insert did not return an id');

    const citationExisting = await client.query<{ id: string }>(
      `SELECT id::text
       FROM evidence.citation
       WHERE evidence_id = $1::uuid
         AND source_locator = $2
         AND COALESCE(source_url, '') = COALESCE($3, '')
       LIMIT 1`,
      [evidenceId, LOCATOR, citationUrl],
    );
    const citationCreated = citationExisting.rowCount === 0;
    if (citationCreated) {
      await client.query(
        `INSERT INTO evidence.citation (
           evidence_id, source_url, document_title, source_locator, quoted_text
         ) VALUES ($1::uuid, $2, $3, $4, $5)`,
        [evidenceId, citationUrl, title, LOCATOR, title],
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
    application_name: 'lotediretor-html-snapshot-parser',
    max: 2,
  });
  const s3 = createS3Client();
  const bucket = process.env.S3_SOURCE_BUCKET ?? 'sources';

  try {
    const snapshot = await loadSnapshot(pool, snapshotId);
    const html = await readVerifiedHtml(s3, bucket, snapshot);
    const $ = load(html);
    const title = $('title').first().text().replace(/\s+/g, ' ').trim();
    if (!title) throw new Error(`Snapshot ${snapshotId} has no non-empty HTML title`);

    const canonicalHref = $('link[rel="canonical"]').first().attr('href')?.trim();
    const citationUrl = sourceUrl(snapshot, canonicalHref);
    const evidence = await persistTitleEvidence(pool, snapshot, title, citationUrl);

    process.stdout.write(
      `${JSON.stringify({
        status: 'ok',
        snapshotId: snapshot.id,
        sourceCode: snapshot.source_code,
        evidenceId: evidence.id,
        evidenceType: EVIDENCE_TYPE,
        evidenceStatus: 'CONFIRMADO',
        parserVersion: PARSER_VERSION,
        created: evidence.created,
        citationCreated: evidence.citationCreated,
        title,
        sourceUrl: citationUrl,
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
