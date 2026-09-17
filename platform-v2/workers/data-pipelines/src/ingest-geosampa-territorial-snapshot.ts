import { createHash } from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Pool, PoolClient } from 'pg';

const CONNECTOR_VERSION = 'geosampa-territorial-wfs-v1';
const SUBJECT_TYPE = 'SP_LOT';

type LayerKey = 'macrozona' | 'macroarea';

type LayerDefinition = {
  typeName: string;
  propertyNames: string[];
};

const LAYERS: Record<LayerKey, LayerDefinition> = {
  macrozona: {
    typeName: 'geoportal:pde2014_v_mcrz_01_map',
    propertyNames: [
      'cd_identificador',
      'sg_macro_divisao_pde',
      'nm_perimetro_divisao_pde',
      'tx_macro_divisao_pde',
      'ge_poligono',
    ],
  },
  macroarea: {
    typeName: 'geoportal:pde_macroarea_lei_18209',
    propertyNames: [
      'cd_identificador_pde_macroarea_lei_18209',
      'sg_macroarea',
      'nm_macroarea',
      'dt_atualizacao',
      'ge_poligono',
    ],
  },
};

type SourceRow = {
  source_registry_id: string;
  source_code: string;
  dataset_code: string;
  parser_version: string | null;
  endpoint_type: string;
  url: string;
  method: string;
};

type SnapshotIdentityRow = {
  id: string;
  object_key: string;
  sha256: string;
};

type CliOptions = {
  sourceCode: string;
  layerKey: LayerKey;
  municipalityIbge: string;
  lotId: string;
  timeoutMs: number;
  maxBytes: number;
};

type LotGeometryRef = {
  evidenceId: string;
  bbox: string;
};

type DownloadedTerritorial = {
  bytes: Buffer;
  rawSha256: string;
  canonicalSha256: string;
  mediaType: string;
  requestUrl: string;
  featureCount: number;
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
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseOptions(): CliOptions {
  const lotId = readArg('lot-id');
  if (!lotId || !/^\d{1,20}$/.test(lotId)) {
    throw new Error('Missing or invalid --lot-id; expected digits only');
  }
  const layerKey = readArg('layer-key');
  if (layerKey !== 'macrozona' && layerKey !== 'macroarea') {
    throw new Error('Missing or invalid --layer-key; expected macrozona or macroarea');
  }
  return {
    sourceCode: readArg('source-code') ?? 'PMSP_GEOSAMPA_TERRITORIAL',
    layerKey,
    municipalityIbge: readArg('municipality-ibge') ?? '3550308',
    lotId,
    timeoutMs: positiveInteger(readArg('timeout-ms'), 30_000, '--timeout-ms'),
    maxBytes: positiveInteger(readArg('max-bytes'), 10 * 1024 * 1024, '--max-bytes'),
  };
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

function safeObjectSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function canonicalPayloadHash(payload: Record<string, unknown>): string {
  const { timeStamp: _volatileTimestamp, ...stablePayload } = payload;
  return createHash('sha256').update(JSON.stringify(stableValue(stablePayload))).digest('hex');
}

async function resolveSource(pool: Pool, options: CliOptions): Promise<SourceRow> {
  const result = await pool.query<SourceRow>(
    `SELECT
       sr.id::text AS source_registry_id,
       sr.source_code,
       sr.dataset_code,
       sr.parser_version,
       se.endpoint_type,
       se.url,
       upper(se.method) AS method
     FROM core.source_registry sr
     JOIN core.municipality m ON m.id = sr.municipality_id
     JOIN core.source_endpoint se ON se.source_registry_id = sr.id AND se.enabled = true
     WHERE sr.source_code = $1
       AND m.ibge_code = $2
       AND se.endpoint_type = 'WFS'
     ORDER BY se.url`,
    [options.sourceCode, options.municipalityIbge],
  );
  if (result.rowCount !== 1) {
    throw new Error(`Expected exactly one enabled WFS endpoint for ${options.sourceCode}, found ${result.rowCount ?? 0}`);
  }
  const source = result.rows[0];
  if (source.method !== 'GET') throw new Error(`GeoSampa territorial connector requires GET endpoint, found ${source.method}`);
  return source;
}


async function loadLotGeometryRef(pool: Pool, lotId: string): Promise<LotGeometryRef> {
  const result = await pool.query<{
    evidence_id: string;
    min_x: number;
    min_y: number;
    max_x: number;
    max_y: number;
  }>(
    `SELECT
       id::text AS evidence_id,
       ST_XMin(Box3D(geometry)) AS min_x,
       ST_YMin(Box3D(geometry)) AS min_y,
       ST_XMax(Box3D(geometry)) AS max_x,
       ST_YMax(Box3D(geometry)) AS max_y
     FROM evidence.evidence
     WHERE subject_type = 'SP_LOT'
       AND subject_id = $1
       AND evidence_type = 'SP_LOT_GEOMETRY'
       AND status = 'CONFIRMADO'
       AND geometry IS NOT NULL
     ORDER BY recorded_at DESC, id DESC
     LIMIT 1`,
    [lotId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`No confirmed lot geometry evidence found for ${lotId}`);
  return {
    evidenceId: row.evidence_id,
    bbox: `${row.min_x},${row.min_y},${row.max_x},${row.max_y},EPSG:4326`,
  };
}

function buildRequestUrl(source: SourceRow, layer: LayerDefinition, bbox: string): string {
  const url = new URL(source.url);
  const params: Record<string, string> = {
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: layer.typeName,
    count: '50',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    propertyName: layer.propertyNames.join(','),
    bbox,
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

function featureCount(payload: Record<string, unknown>): number {
  const features = payload.features;
  if (!Array.isArray(features)) throw new Error('GeoSampa territorial response has no features array');
  if (features.length > 50) throw new Error(`GeoSampa territorial response exceeded candidate limit: ${features.length}`);
  return features.length;
}

async function downloadTerritorial(
  source: SourceRow,
  options: CliOptions,
  layer: LayerDefinition,
  lotGeometry: LotGeometryRef,
): Promise<DownloadedTerritorial> {
  const requestUrl = buildRequestUrl(source, layer, lotGeometry.bbox);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'LoteDiretor-GeoSampaTerritorialSnapshot/0.1 (+https://github.com/paulohspred/paulohspred-lotediretor-zola-brasil)',
      },
    });
    if (!response.ok) throw new Error(`GeoSampa WFS failed with HTTP ${response.status} ${response.statusText}`);
    const contentLength = response.headers.get('content-length');
    if (contentLength && Number(contentLength) > options.maxBytes) {
      throw new Error(`GeoSampa response content-length ${contentLength} exceeds max ${options.maxBytes} bytes`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > options.maxBytes) throw new Error(`GeoSampa response exceeded max ${options.maxBytes} bytes`);
    const rawSha256 = createHash('sha256').update(bytes).digest('hex');
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new Error('GeoSampa WFS returned invalid JSON');
    }
    const candidates = featureCount(payload);
    return {
      bytes,
      rawSha256,
      canonicalSha256: canonicalPayloadHash(payload),
      mediaType: response.headers.get('content-type')?.split(';', 1)[0]?.trim() || 'application/json',
      requestUrl: response.url || requestUrl,
      featureCount: candidates,
    };
  } finally {
    clearTimeout(timer);
  }
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

async function updateSourceChecked(client: PoolClient, sourceId: string): Promise<void> {
  await client.query(
    `UPDATE core.source_registry
     SET last_checked_at = now(), updated_at = now()
     WHERE id = $1::uuid`,
    [sourceId],
  );
}

async function persistSnapshot(
  pool: Pool,
  s3: S3Client,
  bucket: string,
  source: SourceRow,
  options: CliOptions,
  lotGeometry: LotGeometryRef,
  layer: LayerDefinition,
  downloaded: DownloadedTerritorial,
): Promise<SnapshotIdentityRow & { created: boolean; objectCreated: boolean }> {
  const client = await pool.connect();
  const identity = `${source.source_registry_id}:${CONNECTOR_VERSION}:${options.layerKey}:${options.lotId}:${downloaded.canonicalSha256}`;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identity]);
    const equivalent = await client.query<SnapshotIdentityRow>(
      `SELECT id::text, object_key, sha256
       FROM core.source_snapshot
       WHERE source_registry_id = $1::uuid
         AND metadata->>'connectorVersion' = $2
         AND metadata->>'requestedLotId' = $3
         AND metadata->>'canonicalSha256' = $4
         AND metadata->>'layerKey' = $5
       ORDER BY ingested_at DESC, id DESC
       LIMIT 1`,
      [source.source_registry_id, CONNECTOR_VERSION, options.lotId, downloaded.canonicalSha256, options.layerKey],
    );
    if (equivalent.rows[0]) {
      await updateSourceChecked(client, source.source_registry_id);
      await client.query('COMMIT');
      return { ...equivalent.rows[0], created: false, objectCreated: false };
    }

    const objectKey = `raw/${safeObjectSegment(source.source_code)}/${downloaded.rawSha256}`;
    const exists = await objectExists(s3, bucket, objectKey);
    if (!exists) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: downloaded.bytes,
          ContentLength: downloaded.bytes.length,
          ContentType: downloaded.mediaType,
          Metadata: {
            sha256: downloaded.rawSha256,
            canonicalsha256: downloaded.canonicalSha256,
            sourcecode: source.source_code,
            lotid: options.lotId,
            layerkey: options.layerKey,
          },
        }),
      );
    }

    const metadata = {
      connectorVersion: CONNECTOR_VERSION,
      layerKey: options.layerKey,
      subjectType: SUBJECT_TYPE,
      requestedLotId: options.lotId,
      canonicalSha256: downloaded.canonicalSha256,
      canonicalization: 'stable-json-without-top-level-timeStamp-v1',
      endpointType: source.endpoint_type,
      sourceUrl: source.url,
      requestUrl: downloaded.requestUrl,
      typeName: layer.typeName,
      lotGeometryEvidenceId: lotGeometry.evidenceId,
      featureCount: downloaded.featureCount,
    };
    const inserted = await client.query<SnapshotIdentityRow>(
      `INSERT INTO core.source_snapshot (
         source_registry_id, object_key, sha256, media_type, byte_size,
         parser_version, feature_count, metadata
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id::text, object_key, sha256`,
      [
        source.source_registry_id,
        objectKey,
        downloaded.rawSha256,
        downloaded.mediaType,
        downloaded.bytes.length,
        source.parser_version,
        downloaded.featureCount,
        JSON.stringify(metadata),
      ],
    );
    const snapshot = inserted.rows[0];
    if (!snapshot) throw new Error('GeoSampa territorial snapshot insert did not return a row');
    await updateSourceChecked(client, source.source_registry_id);
    await client.query('COMMIT');
    return { ...snapshot, created: true, objectCreated: !exists };
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
    application_name: 'lotediretor-geosampa-territorial-ingest',
    max: 2,
  });
  const s3 = createS3Client();
  const bucket = process.env.S3_SOURCE_BUCKET ?? 'sources';
  try {
    const source = await resolveSource(pool, options);
    const layer = LAYERS[options.layerKey];
    const lotGeometry = await loadLotGeometryRef(pool, options.lotId);
    const downloaded = await downloadTerritorial(source, options, layer, lotGeometry);
    const snapshot = await persistSnapshot(
      pool,
      s3,
      bucket,
      source,
      options,
      lotGeometry,
      layer,
      downloaded,
    );
    process.stdout.write(
      `${JSON.stringify({
        status: 'ok',
        sourceCode: source.source_code,
        datasetCode: source.dataset_code,
        layerKey: options.layerKey,
        subjectType: SUBJECT_TYPE,
        subjectId: options.lotId,
        snapshotId: snapshot.id,
        created: snapshot.created,
        objectCreated: snapshot.objectCreated,
        objectKey: snapshot.object_key,
        sha256: snapshot.sha256,
        fetchedSha256: downloaded.rawSha256,
        canonicalSha256: downloaded.canonicalSha256,
        byteSize: downloaded.bytes.length,
        mediaType: downloaded.mediaType,
        lotGeometryEvidenceId: lotGeometry.evidenceId,
        candidateCount: downloaded.featureCount,
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
