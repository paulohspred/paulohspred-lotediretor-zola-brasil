import { createHash } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Pool } from 'pg';

type SourceEndpointRow = {
  source_registry_id: string;
  source_code: string;
  dataset_code: string;
  parser_version: string | null;
  endpoint_type: string;
  url: string;
  method: string;
};

type SnapshotRow = { id: string };

type CliOptions = {
  sourceCode: string;
  municipalityIbge?: string;
  endpointType?: string;
  timeoutMs: number;
  maxBytes: number;
};

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseOptions(): CliOptions {
  const sourceCode = readArg('source-code');
  if (!sourceCode) {
    throw new Error('Missing required --source-code');
  }

  return {
    sourceCode,
    municipalityIbge: readArg('municipality-ibge'),
    endpointType: readArg('endpoint-type'),
    timeoutMs: positiveInteger(readArg('timeout-ms'), 30_000, '--timeout-ms'),
    maxBytes: positiveInteger(readArg('max-bytes'), 50 * 1024 * 1024, '--max-bytes'),
  };
}

function safeObjectSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

function parseHttpDate(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

async function resolveSource(pool: Pool, options: CliOptions): Promise<SourceEndpointRow> {
  const result = await pool.query<SourceEndpointRow>(
    `SELECT
       sr.id::text AS source_registry_id,
       sr.source_code,
       sr.dataset_code,
       sr.parser_version,
       se.endpoint_type,
       se.url,
       upper(se.method) AS method
     FROM core.source_registry sr
     LEFT JOIN core.municipality m ON m.id = sr.municipality_id
     JOIN core.source_endpoint se
       ON se.source_registry_id = sr.id
      AND se.enabled = true
     WHERE sr.source_code = $1
       AND ($2::text IS NULL OR m.ibge_code = $2)
       AND ($3::text IS NULL OR se.endpoint_type = $3)
     ORDER BY se.endpoint_type, se.url`,
    [options.sourceCode, options.municipalityIbge ?? null, options.endpointType ?? null],
  );

  if (result.rowCount === 0) {
    throw new Error(`No enabled endpoint found for source ${options.sourceCode}`);
  }
  if ((result.rowCount ?? 0) > 1) {
    throw new Error(`Multiple enabled endpoints found for ${options.sourceCode}; pass --endpoint-type`);
  }

  const source = result.rows[0];
  if (source.method !== 'GET') {
    throw new Error(
      `Endpoint ${source.endpoint_type} uses ${source.method}; snapshot ingestion currently supports GET only`,
    );
  }
  return source;
}

async function downloadToTemp(
  source: SourceEndpointRow,
  options: CliOptions,
): Promise<{
  path: string;
  sha256: string;
  byteSize: number;
  mediaType: string | null;
  sourcePublishedAt: string | null;
  etag: string | null;
  finalUrl: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const path = join(tmpdir(), `lotediretor-source-${randomUUID()}`);
  const file = await open(path, 'wx', 0o600);

  try {
    const response = await fetch(source.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: '*/*',
        'user-agent': 'LoteDiretor-SourceSnapshot/0.1 (+https://github.com/paulohspred/paulohspred-lotediretor-zola-brasil)',
      },
    });

    if (!response.ok) {
      throw new Error(`Source fetch failed with HTTP ${response.status} ${response.statusText}`);
    }
    if (!response.body) {
      throw new Error('Source fetch returned an empty response body stream');
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && Number(contentLength) > options.maxBytes) {
      throw new Error(`Source content-length ${contentLength} exceeds max ${options.maxBytes} bytes`);
    }

    const hash = createHash('sha256');
    let byteSize = 0;
    for await (const chunk of Readable.fromWeb(response.body as never)) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      byteSize += buffer.length;
      if (byteSize > options.maxBytes) {
        throw new Error(`Source body exceeded max ${options.maxBytes} bytes`);
      }
      hash.update(buffer);
      await file.write(buffer);
    }

    await file.sync();
    return {
      path,
      sha256: hash.digest('hex'),
      byteSize,
      mediaType: response.headers.get('content-type')?.split(';', 1)[0]?.trim() || null,
      sourcePublishedAt: parseHttpDate(response.headers.get('last-modified')),
      etag: response.headers.get('etag'),
      finalUrl: response.url || source.url,
    };
  } catch (error) {
    await file.close();
    await unlink(path).catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
  }
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

async function objectExists(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return false;
    throw error;
  }
}

async function registerSnapshot(
  pool: Pool,
  source: SourceEndpointRow,
  objectKey: string,
  downloaded: Awaited<ReturnType<typeof downloadToTemp>>,
): Promise<{ id: string; created: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const metadata = {
      endpointType: source.endpoint_type,
      sourceUrl: source.url,
      finalUrl: downloaded.finalUrl,
      etag: downloaded.etag,
    };
    const inserted = await client.query<SnapshotRow>(
      `INSERT INTO core.source_snapshot (
         source_registry_id, object_key, sha256, media_type, byte_size,
         source_published_at, parser_version, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (source_registry_id, sha256) DO NOTHING
       RETURNING id::text`,
      [
        source.source_registry_id,
        objectKey,
        downloaded.sha256,
        downloaded.mediaType,
        downloaded.byteSize,
        downloaded.sourcePublishedAt,
        source.parser_version,
        JSON.stringify(metadata),
      ],
    );

    let id = inserted.rows[0]?.id;
    const created = Boolean(id);
    if (!id) {
      const existing = await client.query<SnapshotRow>(
        `SELECT id::text
         FROM core.source_snapshot
         WHERE source_registry_id = $1 AND sha256 = $2`,
        [source.source_registry_id, downloaded.sha256],
      );
      id = existing.rows[0]?.id;
    }
    if (!id) throw new Error('Snapshot insert conflicted but existing row was not found');

    await client.query(
      `UPDATE core.source_registry
       SET last_checked_at = now(),
           last_source_update = COALESCE($2::timestamptz, last_source_update),
           updated_at = now()
       WHERE id = $1`,
      [source.source_registry_id, downloaded.sourcePublishedAt],
    );
    await client.query('COMMIT');
    return { id, created };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const options = parseOptions();
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      'postgres://lotediretor:change-me-platform-db@127.0.0.1:55432/lotediretor_platform',
    application_name: 'lotediretor-data-pipelines',
    max: 2,
  });
  const s3 = createS3Client();
  const bucket = process.env.S3_SOURCE_BUCKET ?? 'sources';

  try {
    const source = await resolveSource(pool, options);
    const downloaded = await downloadToTemp(source, options);
    try {
      const objectKey = `raw/${safeObjectSegment(source.source_code)}/${downloaded.sha256}`;
      const exists = await objectExists(s3, bucket, objectKey);
      if (!exists) {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            Body: createReadStream(downloaded.path),
            ContentLength: downloaded.byteSize,
            ContentType: downloaded.mediaType ?? 'application/octet-stream',
            Metadata: {
              sha256: downloaded.sha256,
              sourcecode: source.source_code,
            },
          }),
        );
      }

      const snapshot = await registerSnapshot(pool, source, objectKey, downloaded);
      process.stdout.write(
        `${JSON.stringify({
          status: 'ok',
          sourceCode: source.source_code,
          datasetCode: source.dataset_code,
          snapshotId: snapshot.id,
          created: snapshot.created,
          objectCreated: !exists,
          objectKey,
          sha256: downloaded.sha256,
          byteSize: downloaded.byteSize,
          mediaType: downloaded.mediaType,
        })}\n`,
      );
    } finally {
      await unlink(downloaded.path).catch(() => undefined);
    }
  } finally {
    await pool.end();
    s3.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
