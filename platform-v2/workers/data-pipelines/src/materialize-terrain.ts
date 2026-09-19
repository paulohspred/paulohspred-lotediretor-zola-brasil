import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Pool, PoolClient } from 'pg';

const execFileAsync = promisify(execFile);

const SUBJECT_TYPE = 'SP_LOT';
const SOURCE_CODE = 'PMSP_TERRITORIO_TOPOGRAFIA';
const ROAD_SOURCE_CODE = 'PMSP_SISTEMA_VIARIO';
const INDEX_TYPE_NAME = 'geoportal:quadricula_folha_mdt_mds_2020';
const ROAD_TYPE_NAME = 'geoportal:segmento_logradouro';
const DOWNLOAD_VERSION = 'terrain-mdt-2020-download-v1';
const ANALYSIS_VERSION = 'terrain-mdt-2020-surface-v5';
const ROAD_CONNECTOR_VERSION = 'sistema-viario-segmento-v1';
const TERRAIN_INDEX_PADDING_DEGREES = 0.001;
const MAX_ROAD_FEATURES = 100;
const MAX_SHEETS = 8;
const MAX_ZIP_BYTES = 50 * 1024 * 1024;

type JsonGeometry = {
  type: string;
  coordinates: unknown;
};

type LotGeometryRow = {
  evidence_id: string;
  geometry_json: JsonGeometry;
  source_snapshot_sha256: string;
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

type SourceConfig = {
  sourceRegistryId: string;
  sourceCode: string;
  datasetCode: string;
  wfsUrl: string;
  downloadUrl: string;
};

type RoadSourceConfig = {
  sourceRegistryId: string;
  sourceCode: string;
  datasetCode: string;
  wfsUrl: string;
};

type LotAddressRow = {
  street_name: string | null;
  street_number: string | null;
};

type StreetInput = {
  sourceRegistryId: string;
  snapshotId: string;
  objectKey: string;
  sha256: string;
  requestUrl: string;
  streetName: string;
  streetNumber: string | null;
  featureCollection: {
    type: 'FeatureCollection';
    features: Array<Record<string, unknown>>;
  };
};

type SheetFeature = {
  code: string;
  featureId: string | null;
  year: number | null;
  survey: string | null;
  scale: string | null;
};

type SnapshotIdentity = {
  id: string;
  object_key: string;
  sha256: string;
};

type InputSnapshot = {
  sheetCode: string;
  snapshotId: string;
  objectKey: string;
  sha256: string;
  byteSize: number;
  downloadUrl: string;
  localPath: string;
  year: number | null;
  survey: string | null;
  scale: string | null;
};

type TerrainPoint = {
  easting: number;
  northing: number;
  longitude: number;
  latitude: number;
  elevationM: number;
};

type TerrainAccessAnalysis = {
  status: 'DISPONIVEL' | 'NAO_DISPONIVEL';
  streetName?: string | null;
  streetNumber?: string | null;
  reason?: string;
  selectedSegmentId?: string | number | null;
  selectionMethod?: string;
  addressRangeMatched?: boolean;
  streetCenterlineDistanceM?: number;
  lotBoundaryElevationM?: number;
  streetAxisElevationM?: number;
  lotAboveStreetM?: number;
  straightConnectionGradePercent?: number;
  candidateAccessPoint?: Record<string, unknown>;
  streetAxisPoint?: Record<string, unknown>;
  accessConnector?: Record<string, unknown>;
  streetProfile?: {
    spacingM: number;
    lengthM: number;
    elevationStartM: number;
    elevationEndM: number;
    netGradePercent: number;
    medianAbsoluteGradePercent: number;
    p95AbsoluteGradePercent: number;
    maxAbsoluteGradePercent: number;
    line: Record<string, unknown>;
    samples: Array<Record<string, unknown>>;
  };
  method: string;
};

type TerrainAnalysis = {
  analysisVersion: string;
  horizontalCrs: string;
  verticalDatum: string | string[] | null;
  lotAreaM2: number;
  pointCount: number;
  contextPointCount: number;
  pointDensityPerM2: number;
  elevationMinM: number;
  elevationMaxM: number;
  elevationMeanM: number;
  elevationMedianM: number;
  reliefAmplitudeM: number;
  bestFitPlane: {
    dzdx: number;
    dzdy: number;
    slopePercent: number;
    slopeDegrees: number;
    downslopeAspectDegrees: number;
    downslopeAspectLabel: string;
    rmseM: number;
  };
  localSlope: {
    meanPercent: number;
    medianPercent: number;
    p95Percent: number;
    maxPercent: number;
    maxDegrees: number;
    maxPoint: {
      easting: number;
      northing: number;
      longitude: number;
      latitude: number;
      slopePercent: number;
      slopeDegrees: number;
    };
    bands: Array<{
      label: string;
      lowerPercent: number;
      upperPercent: number | null;
      sampleCount: number;
      sharePercent: number;
      approxAreaM2: number;
    }>;
    gridResolutionM: number;
    method: string;
  };
  surface: {
    version: string;
    contextBufferM: number;
    grid: Record<string, unknown>;
    tin: Record<string, unknown>;
    tinTriangleCount: number;
    tinAreaWeightedMeanSlopePercent: number | null;
    contours: Record<string, Record<string, unknown>>;
    contourIntervalsM: number[];
    profiles: {
      method: string;
      spacingM: number;
      principal: TerrainProfile;
      transversal: TerrainProfile;
    };
    hydrology: {
      method: string;
      gridResolutionM: number;
      contextBufferM: number;
      preferredRunoffDirectionDegrees: number | null;
      preferredRunoffDirectionLabel: string | null;
      basinCount: number;
      outletCount: number;
      mainInternalBasinApproxAreaM2: number;
      mainOutlet: {
        longitude: number;
        latitude: number;
        elevationM: number;
        basinId: number;
      };
      depressionScreening: {
        maxFillDepthM: number;
        estimatedFillVolumeM3: number;
        affectedSampleCountAbove1Cm: number;
      };
      basins: Record<string, unknown>;
      divides: Record<string, unknown>;
      flowPaths: Record<string, unknown>;
      outlets: Record<string, unknown>;
    };
    access: TerrainAccessAnalysis;
  };
  lowPoint: TerrainPoint;
  highPoint: TerrainPoint;
  inputs: Array<{
    sheetCode: string;
    pointCountTotal: number;
    pointCountContext: number;
    pointCountInsideLot: number;
    lazFileName: string;
    epsg: number;
    verticalDatum: string | null;
  }>;
};

type TerrainProfile = {
  id: string;
  label: string;
  spacingM: number;
  lengthM: number;
  elevationStartM: number;
  elevationEndM: number;
  elevationMinM: number;
  elevationMaxM: number;
  reliefAmplitudeM: number;
  netGradePercent: number;
  line: Record<string, unknown>;
  samples: Array<{
    distanceM: number;
    elevationM: number;
    longitude: number;
    latitude: number;
  }>;
};

type EvidenceFact = {
  evidenceType: string;
  locator: string;
  valueText: string;
  unit?: string;
  geometry?: {
    type: 'Point';
    coordinates: [number, number];
  };
  calculationMethod: string;
};

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function parseOptions(): { municipalityIbge: string; lotId: string } {
  const lotId = readArg('lot-id');
  if (!lotId || !/^\d{1,20}$/.test(lotId)) {
    throw new Error('Missing or invalid --lot-id; expected digits only');
  }
  return {
    municipalityIbge: readArg('municipality-ibge') ?? '3550308',
    lotId,
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

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeStreetName(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = normalized.split(' ').filter(Boolean);
  const prefixes = new Set([
    'R', 'RUA', 'AV', 'AVENIDA', 'AL', 'ALAMEDA', 'PC', 'PRACA',
    'TV', 'TRAV', 'TRAVESSA', 'EST', 'ESTRADA', 'ROD', 'RODOVIA',
  ]);
  while (tokens.length > 1 && prefixes.has(tokens[0])) tokens.shift();
  return tokens.join(' ');
}

function geometryBbox(geometry: JsonGeometry): [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];
  const visit = (value: unknown): void => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      xs.push(value[0]);
      ys.push(value[1]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry.coordinates);
  if (!xs.length || !ys.length) throw new Error('Lot geometry has no coordinates');
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

async function loadLotGeometry(pool: Pool, lotId: string): Promise<LotGeometryRow> {
  const result = await pool.query<LotGeometryRow>(
    `SELECT
       e.id::text AS evidence_id,
       ST_AsGeoJSON(e.geometry)::jsonb AS geometry_json,
       ss.sha256 AS source_snapshot_sha256
     FROM evidence.evidence e
     JOIN core.source_snapshot ss ON ss.id = e.source_snapshot_id
     WHERE e.subject_type = 'SP_LOT'
       AND e.subject_id = $1
       AND e.evidence_type = 'SP_LOT_GEOMETRY'
       AND e.status = 'CONFIRMADO'
       AND e.geometry IS NOT NULL
     ORDER BY e.recorded_at DESC, e.id DESC
     LIMIT 1`,
    [lotId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Versioned lot geometry not found for ${lotId}`);
  return row;
}

async function loadLotAddress(pool: Pool, lotId: string): Promise<LotAddressRow> {
  const result = await pool.query<LotAddressRow>(
    `SELECT
       (
         SELECT value_text
         FROM evidence.evidence
         WHERE subject_type = 'SP_LOT'
           AND subject_id = $1
           AND evidence_type = 'SP_LOT_STREET_NAME'
           AND status = 'CONFIRMADO'
         ORDER BY recorded_at DESC, id DESC
         LIMIT 1
       ) AS street_name,
       (
         SELECT value_text
         FROM evidence.evidence
         WHERE subject_type = 'SP_LOT'
           AND subject_id = $1
           AND evidence_type = 'SP_LOT_STREET_NUMBER'
           AND status = 'CONFIRMADO'
         ORDER BY recorded_at DESC, id DESC
         LIMIT 1
       ) AS street_number`,
    [lotId],
  );
  return result.rows[0] ?? { street_name: null, street_number: null };
}

async function resolveSource(pool: Pool, municipalityIbge: string): Promise<SourceConfig> {
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
     JOIN core.source_endpoint se ON se.source_registry_id = sr.id
     WHERE sr.source_code = $1
       AND m.ibge_code = $2
       AND se.enabled = true
       AND se.endpoint_type IN ('WFS', 'DOWNLOAD')
     ORDER BY se.endpoint_type, se.url`,
    [SOURCE_CODE, municipalityIbge],
  );
  const wfs = result.rows.find((row) => row.endpoint_type === 'WFS');
  const download = result.rows.find((row) => row.endpoint_type === 'DOWNLOAD');
  if (!wfs || !download) {
    throw new Error(
      `Topography source requires enabled WFS and DOWNLOAD endpoints; found ${result.rowCount ?? 0}`,
    );
  }
  if (wfs.method !== 'GET' || download.method !== 'GET') {
    throw new Error('Topography WFS and DOWNLOAD endpoints must use GET');
  }
  return {
    sourceRegistryId: wfs.source_registry_id,
    sourceCode: wfs.source_code,
    datasetCode: wfs.dataset_code,
    wfsUrl: wfs.url,
    downloadUrl: download.url,
  };
}

async function resolveRoadSource(
  pool: Pool,
  municipalityIbge: string,
): Promise<RoadSourceConfig> {
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
     JOIN core.source_endpoint se ON se.source_registry_id = sr.id
     WHERE sr.source_code = $1
       AND m.ibge_code = $2
       AND se.enabled = true
       AND se.endpoint_type = 'WFS'
     ORDER BY se.url`,
    [ROAD_SOURCE_CODE, municipalityIbge],
  );
  const wfs = result.rows[0];
  if (!wfs) {
    throw new Error(`Road source ${ROAD_SOURCE_CODE} requires an enabled WFS endpoint`);
  }
  if (wfs.method !== 'GET') throw new Error('Road WFS endpoint must use GET');
  return {
    sourceRegistryId: wfs.source_registry_id,
    sourceCode: wfs.source_code,
    datasetCode: wfs.dataset_code,
    wfsUrl: wfs.url,
  };
}

async function listSheets(
  source: SourceConfig,
  geometry: JsonGeometry,
): Promise<SheetFeature[]> {
  const [west, south, east, north] = geometryBbox(geometry);
  const url = new URL(source.wfsUrl);
  url.search = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: INDEX_TYPE_NAME,
    count: String(MAX_SHEETS + 1),
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    bbox: `${west - TERRAIN_INDEX_PADDING_DEGREES},${south - TERRAIN_INDEX_PADDING_DEGREES},${east + TERRAIN_INDEX_PADDING_DEGREES},${north + TERRAIN_INDEX_PADDING_DEGREES},EPSG:4326`,
    propertyName: [
      'cd_quadricula',
      'an_levantamento',
      'tx_levantamento',
      'cd_escala_quadricula',
      'ge_poligono',
    ].join(','),
  }).toString();

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'LoteDiretor-TerrainMaterializer/0.1',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Terrain index WFS failed with HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    features?: Array<{
      id?: string;
      properties?: Record<string, unknown>;
    }>;
  };
  const features = payload.features ?? [];
  if (!features.length) throw new Error('No MDT 2020 sheet intersects lot bbox');
  if (features.length > MAX_SHEETS) {
    throw new Error(`Terrain index returned more than ${MAX_SHEETS} sheets for one lot`);
  }
  const byCode = new Map<string, SheetFeature>();
  features.forEach((feature) => {
    const properties = feature.properties ?? {};
    const code = String(properties.cd_quadricula ?? '').trim();
    if (!code) return;
    byCode.set(code, {
      code,
      featureId: typeof feature.id === 'string' ? feature.id : null,
      year:
        properties.an_levantamento == null
          ? null
          : Number(properties.an_levantamento),
      survey:
        properties.tx_levantamento == null
          ? null
          : String(properties.tx_levantamento),
      scale:
        properties.cd_escala_quadricula == null
          ? null
          : String(properties.cd_escala_quadricula),
    });
  });
  const sheets = [...byCode.values()].sort((left, right) =>
    left.code.localeCompare(right.code),
  );
  if (!sheets.length) throw new Error('Terrain index returned no sheet codes');
  return sheets;
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

async function ensureObject(
  s3: S3Client,
  bucket: string,
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  if (await objectExists(s3, bucket, key)) return;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentLength: bytes.length,
      ContentType: contentType,
    }),
  );
}

async function persistSourceSnapshot(
  pool: Pool,
  source: Pick<SourceConfig, 'sourceRegistryId'> | RoadSourceConfig,
  objectKey: string,
  contentSha256: string,
  mediaType: string,
  byteSize: number,
  parserVersion: string,
  metadata: Record<string, unknown>,
  featureCount: number | null = null,
): Promise<SnapshotIdentity> {
  const inserted = await pool.query<SnapshotIdentity>(
    `INSERT INTO core.source_snapshot (
       source_registry_id, object_key, sha256, media_type, byte_size,
       parser_version, feature_count, metadata
     ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (source_registry_id, sha256) DO NOTHING
     RETURNING id::text, object_key, sha256`,
    [
      source.sourceRegistryId,
      objectKey,
      contentSha256,
      mediaType,
      byteSize,
      parserVersion,
      featureCount,
      JSON.stringify(metadata),
    ],
  );
  if (inserted.rows[0]) return inserted.rows[0];
  const existing = await pool.query<SnapshotIdentity>(
    `SELECT id::text, object_key, sha256
     FROM core.source_snapshot
     WHERE source_registry_id = $1::uuid
       AND sha256 = $2
     LIMIT 1`,
    [source.sourceRegistryId, contentSha256],
  );
  if (!existing.rows[0]) throw new Error('Source snapshot insert conflict could not be resolved');
  return existing.rows[0];
}

async function fetchStreetInput(
  pool: Pool,
  s3: S3Client,
  bucket: string,
  source: RoadSourceConfig,
  geometry: JsonGeometry,
  address: LotAddressRow,
): Promise<StreetInput | null> {
  const streetName = String(address.street_name ?? '').trim();
  if (!streetName) return null;

  const [west, south, east, north] = geometryBbox(geometry);
  const url = new URL(source.wfsUrl);
  url.search = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: ROAD_TYPE_NAME,
    count: String(MAX_ROAD_FEATURES),
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    bbox: `${west - TERRAIN_INDEX_PADDING_DEGREES},${south - TERRAIN_INDEX_PADDING_DEGREES},${east + TERRAIN_INDEX_PADDING_DEGREES},${north + TERRAIN_INDEX_PADDING_DEGREES},EPSG:4326`,
  }).toString();

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'LoteDiretor-TerrainMaterializer/0.1',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Road WFS failed with HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    features?: Array<{
      id?: string;
      type?: string;
      geometry?: Record<string, unknown> | null;
      properties?: Record<string, unknown>;
    }>;
  };
  const targetName = normalizeStreetName(streetName);
  const features = (payload.features ?? [])
    .filter((feature) =>
      normalizeStreetName(String(feature.properties?.nm_logradouro ?? '')) ===
      targetName,
    )
    .map((feature) => ({
      type: 'Feature',
      id: feature.id ?? null,
      geometry: feature.geometry ?? null,
      properties: {
        cd_identificador: feature.properties?.cd_identificador ?? null,
        cd_identificador_logradouro:
          feature.properties?.cd_identificador_logradouro ?? null,
        codlog: feature.properties?.codlog ?? null,
        cd_tipo_logradouro: feature.properties?.cd_tipo_logradouro ?? null,
        nm_logradouro: feature.properties?.nm_logradouro ?? null,
        cd_numero_inicial_par:
          feature.properties?.cd_numero_inicial_par ?? null,
        cd_numero_final_par: feature.properties?.cd_numero_final_par ?? null,
        cd_numero_inicial_impar:
          feature.properties?.cd_numero_inicial_impar ?? null,
        cd_numero_final_impar:
          feature.properties?.cd_numero_final_impar ?? null,
        cd_numero_ordem_segmento:
          feature.properties?.cd_numero_ordem_segmento ?? null,
        qt_leito_carrocavel: feature.properties?.qt_leito_carrocavel ?? null,
      },
    }))
    .sort((left, right) =>
      String(left.properties.cd_identificador ?? '').localeCompare(
        String(right.properties.cd_identificador ?? ''),
      ),
    );

  const featureCollection = {
    type: 'FeatureCollection' as const,
    features: features as Array<Record<string, unknown>>,
  };
  const bytes = Buffer.from(stableJson(featureCollection), 'utf8');
  const contentSha256 = sha256(bytes);
  const objectKey =
    `raw/${source.sourceCode}/segmento-logradouro/${contentSha256}.geojson`;
  await ensureObject(s3, bucket, objectKey, bytes, 'application/geo+json');
  const snapshot = await persistSourceSnapshot(
    pool,
    source,
    objectKey,
    contentSha256,
    'application/geo+json',
    bytes.length,
    ROAD_CONNECTOR_VERSION,
    {
      snapshotKind: 'ROAD_SEGMENT_QUERY',
      requestedStreetName: streetName,
      requestedStreetNumber: address.street_number,
      requestUrl: url.toString(),
      typeName: ROAD_TYPE_NAME,
    },
    features.length,
  );

  await pool.query(
    `UPDATE core.source_registry
     SET last_checked_at = now(), ingestion_status = 'healthy', updated_at = now()
     WHERE id = $1::uuid`,
    [source.sourceRegistryId],
  );

  return {
    sourceRegistryId: source.sourceRegistryId,
    snapshotId: snapshot.id,
    objectKey: snapshot.object_key,
    sha256: snapshot.sha256,
    requestUrl: url.toString(),
    streetName,
    streetNumber:
      address.street_number == null ? null : String(address.street_number),
    featureCollection,
  };
}

async function downloadSheet(
  pool: Pool,
  s3: S3Client,
  bucket: string,
  source: SourceConfig,
  sheet: SheetFeature,
  tempRoot: string,
): Promise<InputSnapshot> {
  const url = new URL(source.downloadUrl);
  url.searchParams.set('key', 'cd_quadricula');
  url.searchParams.set('value', sheet.code);
  const response = await fetch(url, {
    headers: {
      accept: 'application/zip,application/octet-stream,*/*',
      'user-agent': 'LoteDiretor-TerrainMaterializer/0.1',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    throw new Error(`MDT 2020 sheet ${sheet.code} failed with HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error(`MDT 2020 sheet ${sheet.code} did not return a ZIP archive`);
  }
  if (bytes.length > MAX_ZIP_BYTES) {
    throw new Error(
      `MDT 2020 sheet ${sheet.code} exceeds ${MAX_ZIP_BYTES} bytes`,
    );
  }
  const contentSha256 = sha256(bytes);
  const objectKey =
    `raw/${source.sourceCode}/mdt-2020/${sheet.code}/${contentSha256}.zip`;
  await ensureObject(s3, bucket, objectKey, bytes, 'application/zip');
  const snapshot = await persistSourceSnapshot(
    pool,
    source,
    objectKey,
    contentSha256,
    'application/zip',
    bytes.length,
    DOWNLOAD_VERSION,
    {
      assetType: 'MDT_2020_LAZ_ZIP',
      sheetCode: sheet.code,
      indexFeatureId: sheet.featureId,
      sourceYear: sheet.year,
      survey: sheet.survey,
      scale: sheet.scale,
      requestUrl: url.toString(),
    },
  );
  const localPath = join(tempRoot, `mdt-${sheet.code}.zip`);
  await writeFile(localPath, bytes);
  return {
    sheetCode: sheet.code,
    snapshotId: snapshot.id,
    objectKey: snapshot.object_key,
    sha256: snapshot.sha256,
    byteSize: bytes.length,
    downloadUrl: url.toString(),
    localPath,
    year: sheet.year,
    survey: sheet.survey,
    scale: sheet.scale,
  };
}

async function analyzeTerrain(
  geometry: JsonGeometry,
  inputs: InputSnapshot[],
  address: LotAddressRow,
  streetInput: StreetInput | null,
): Promise<TerrainAnalysis> {
  const scriptPath = fileURLToPath(new URL('./analyze-terrain-laz.py', import.meta.url));
  const python = process.env.TERRAIN_PYTHON ?? 'python3';
  const args = [scriptPath, '--lot-geometry-json', JSON.stringify(geometry)];
  if (address.street_name) {
    args.push('--street-name', String(address.street_name));
  }
  if (address.street_number) {
    args.push('--street-number', String(address.street_number));
  }
  if (streetInput) {
    args.push(
      '--street-candidates-json',
      JSON.stringify(streetInput.featureCollection),
    );
  }
  inputs.forEach((input) => {
    args.push('--zip', `${input.sheetCode}=${input.localPath}`);
  });
  const result = await execFileAsync(python, args, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 180_000,
  });
  const stdout = String(result.stdout ?? '').trim();
  const lastLine = stdout.split('\n').filter(Boolean).at(-1);
  if (!lastLine) throw new Error('Terrain analyzer returned no JSON');
  return JSON.parse(lastLine) as TerrainAnalysis;
}

function metric(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '');
}

function factsFromAnalysis(analysis: TerrainAnalysis): EvidenceFact[] {
  const elevationMethod =
    'MDT 2020 LiDAR points clipped to the versioned lot geometry in SIRGAS 2000 / UTM 23S (EPSG:31983); duplicate seam points removed';
  const planeMethod =
    'Least-squares best-fit plane over deduplicated MDT points inside the versioned lot geometry; reports global terrain gradient, not local maximum slope';
  const facts: EvidenceFact[] = [
    {
      evidenceType: 'SP_LOT_TERRAIN_ELEVATION_MIN',
      locator: 'analysis:elevation:min',
      valueText: metric(analysis.elevationMinM, 3),
      unit: 'm',
      geometry: {
        type: 'Point',
        coordinates: [analysis.lowPoint.longitude, analysis.lowPoint.latitude],
      },
      calculationMethod: elevationMethod,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_ELEVATION_MAX',
      locator: 'analysis:elevation:max',
      valueText: metric(analysis.elevationMaxM, 3),
      unit: 'm',
      geometry: {
        type: 'Point',
        coordinates: [analysis.highPoint.longitude, analysis.highPoint.latitude],
      },
      calculationMethod: elevationMethod,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_ELEVATION_MEAN',
      locator: 'analysis:elevation:mean',
      valueText: metric(analysis.elevationMeanM, 3),
      unit: 'm',
      calculationMethod: elevationMethod,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_ELEVATION_MEDIAN',
      locator: 'analysis:elevation:median',
      valueText: metric(analysis.elevationMedianM, 3),
      unit: 'm',
      calculationMethod: elevationMethod,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_RELIEF_AMPLITUDE',
      locator: 'analysis:relief:amplitude',
      valueText: metric(analysis.reliefAmplitudeM, 3),
      unit: 'm',
      calculationMethod: elevationMethod,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_POINT_COUNT',
      locator: 'analysis:point-count',
      valueText: String(analysis.pointCount),
      unit: 'pontos',
      calculationMethod: elevationMethod,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_POINT_DENSITY',
      locator: 'analysis:point-density',
      valueText: metric(analysis.pointDensityPerM2, 3),
      unit: 'pontos/m²',
      calculationMethod: elevationMethod,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_BEST_FIT_SLOPE_PERCENT',
      locator: 'analysis:best-fit-plane:slope-percent',
      valueText: metric(analysis.bestFitPlane.slopePercent, 2),
      unit: '%',
      calculationMethod: planeMethod,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_BEST_FIT_SLOPE_DEGREES',
      locator: 'analysis:best-fit-plane:slope-degrees',
      valueText: metric(analysis.bestFitPlane.slopeDegrees, 2),
      unit: '°',
      calculationMethod: planeMethod,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_DOWNSLOPE_ASPECT',
      locator: 'analysis:best-fit-plane:downslope-aspect',
      valueText:
        `${metric(analysis.bestFitPlane.downslopeAspectDegrees, 1)}° ${analysis.bestFitPlane.downslopeAspectLabel}`,
      calculationMethod: planeMethod,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_BEST_FIT_RMSE',
      locator: 'analysis:best-fit-plane:rmse',
      valueText: metric(analysis.bestFitPlane.rmseM, 3),
      unit: 'm',
      calculationMethod: planeMethod,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_LOCAL_SLOPE_MEAN',
      locator: 'analysis:surface:grid-1m:slope-mean',
      valueText: metric(analysis.localSlope.meanPercent, 2),
      unit: '%',
      calculationMethod: analysis.localSlope.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_LOCAL_SLOPE_MEDIAN',
      locator: 'analysis:surface:grid-1m:slope-median',
      valueText: metric(analysis.localSlope.medianPercent, 2),
      unit: '%',
      calculationMethod: analysis.localSlope.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_LOCAL_SLOPE_P95',
      locator: 'analysis:surface:grid-1m:slope-p95',
      valueText: metric(analysis.localSlope.p95Percent, 2),
      unit: '%',
      calculationMethod: analysis.localSlope.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_LOCAL_SLOPE_MAX',
      locator: 'analysis:surface:grid-1m:slope-max',
      valueText: metric(analysis.localSlope.maxPercent, 2),
      unit: '%',
      geometry: {
        type: 'Point',
        coordinates: [
          analysis.localSlope.maxPoint.longitude,
          analysis.localSlope.maxPoint.latitude,
        ],
      },
      calculationMethod: analysis.localSlope.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_LOCAL_SLOPE_MAX_DEGREES',
      locator: 'analysis:surface:grid-1m:slope-max-degrees',
      valueText: metric(analysis.localSlope.maxDegrees, 2),
      unit: '°',
      calculationMethod: analysis.localSlope.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_SLOPE_DISTRIBUTION',
      locator: 'analysis:surface:grid-1m:slope-distribution',
      valueText: analysis.localSlope.bands
        .map(
          (band) =>
            `${band.label}: ${metric(band.sharePercent, 1)}%`,
        )
        .join('; '),
      calculationMethod: analysis.localSlope.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_SURFACE_MODEL',
      locator: 'analysis:surface:model',
      valueText: `${analysis.surface.version}; grade ${metric(
        analysis.localSlope.gridResolutionM,
        1,
      )} m; ${analysis.surface.tinTriangleCount} células TIN`,
      calculationMethod:
        'Versioned terrain product containing a 1 m interpolated grid, clipped TIN polygons and derived contour sets at 0.5/1/2/5 m intervals',
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_PROFILE_PRINCIPAL_LENGTH',
      locator: 'analysis:surface:profile:principal:length',
      valueText: metric(analysis.surface.profiles.principal.lengthM, 2),
      unit: 'm',
      calculationMethod: analysis.surface.profiles.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_PROFILE_PRINCIPAL_GRADE',
      locator: 'analysis:surface:profile:principal:net-grade',
      valueText: metric(analysis.surface.profiles.principal.netGradePercent, 2),
      unit: '%',
      calculationMethod: analysis.surface.profiles.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_PROFILE_TRANSVERSAL_LENGTH',
      locator: 'analysis:surface:profile:transversal:length',
      valueText: metric(analysis.surface.profiles.transversal.lengthM, 2),
      unit: 'm',
      calculationMethod: analysis.surface.profiles.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_PROFILE_TRANSVERSAL_GRADE',
      locator: 'analysis:surface:profile:transversal:net-grade',
      valueText: metric(analysis.surface.profiles.transversal.netGradePercent, 2),
      unit: '%',
      calculationMethod: analysis.surface.profiles.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_RUNOFF_DIRECTION',
      locator: 'analysis:surface:hydrology:preferred-direction',
      valueText:
        analysis.surface.hydrology.preferredRunoffDirectionDegrees == null
          ? 'NÃO DISPONÍVEL'
          : `${metric(analysis.surface.hydrology.preferredRunoffDirectionDegrees, 1)}° ${analysis.surface.hydrology.preferredRunoffDirectionLabel ?? ''}`.trim(),
      calculationMethod: analysis.surface.hydrology.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_DRAINAGE_BASIN_COUNT',
      locator: 'analysis:surface:hydrology:basin-count',
      valueText: String(analysis.surface.hydrology.basinCount),
      unit: 'sub-bacias internas',
      calculationMethod: analysis.surface.hydrology.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_MAIN_INTERNAL_BASIN_AREA',
      locator: 'analysis:surface:hydrology:main-basin-area',
      valueText: metric(analysis.surface.hydrology.mainInternalBasinApproxAreaM2, 2),
      unit: 'm²',
      calculationMethod: analysis.surface.hydrology.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_MAIN_OUTLET_ELEVATION',
      locator: 'analysis:surface:hydrology:main-outlet-elevation',
      valueText: metric(analysis.surface.hydrology.mainOutlet.elevationM, 3),
      unit: 'm',
      geometry: {
        type: 'Point',
        coordinates: [
          analysis.surface.hydrology.mainOutlet.longitude,
          analysis.surface.hydrology.mainOutlet.latitude,
        ],
      },
      calculationMethod: analysis.surface.hydrology.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_DEPRESSION_MAX_FILL_DEPTH',
      locator: 'analysis:surface:hydrology:depression-max-fill-depth',
      valueText: metric(analysis.surface.hydrology.depressionScreening.maxFillDepthM, 3),
      unit: 'm',
      calculationMethod: analysis.surface.hydrology.method,
    },
    {
      evidenceType: 'SP_LOT_TERRAIN_DEPRESSION_FILL_VOLUME',
      locator: 'analysis:surface:hydrology:depression-fill-volume',
      valueText: metric(analysis.surface.hydrology.depressionScreening.estimatedFillVolumeM3, 3),
      unit: 'm³',
      calculationMethod: analysis.surface.hydrology.method,
    },
  ];

  const access = analysis.surface.access;
  if (
    access.status === 'DISPONIVEL' &&
    access.streetProfile &&
    access.streetCenterlineDistanceM != null &&
    access.lotBoundaryElevationM != null &&
    access.streetAxisElevationM != null &&
    access.lotAboveStreetM != null &&
    access.straightConnectionGradePercent != null
  ) {
    facts.push(
      {
        evidenceType: 'SP_LOT_TERRAIN_ACCESS_STREET_SEGMENT',
        locator: 'analysis:surface:access:street-segment',
        valueText: String(access.selectedSegmentId ?? ''),
        calculationMethod: access.method,
      },
      {
        evidenceType: 'SP_LOT_TERRAIN_ACCESS_CENTERLINE_DISTANCE',
        locator: 'analysis:surface:access:centerline-distance',
        valueText: metric(access.streetCenterlineDistanceM, 3),
        unit: 'm',
        calculationMethod: access.method,
      },
      {
        evidenceType: 'SP_LOT_TERRAIN_ACCESS_LOT_BOUNDARY_ELEVATION',
        locator: 'analysis:surface:access:lot-boundary-elevation',
        valueText: metric(access.lotBoundaryElevationM, 3),
        unit: 'm',
        calculationMethod: access.method,
      },
      {
        evidenceType: 'SP_LOT_TERRAIN_ACCESS_STREET_AXIS_ELEVATION',
        locator: 'analysis:surface:access:street-axis-elevation',
        valueText: metric(access.streetAxisElevationM, 3),
        unit: 'm',
        calculationMethod: access.method,
      },
      {
        evidenceType: 'SP_LOT_TERRAIN_ACCESS_ELEVATION_DIFFERENCE',
        locator: 'analysis:surface:access:elevation-difference',
        valueText: metric(access.lotAboveStreetM, 3),
        unit: 'm',
        calculationMethod: access.method,
      },
      {
        evidenceType: 'SP_LOT_TERRAIN_ACCESS_STRAIGHT_GRADE',
        locator: 'analysis:surface:access:straight-grade',
        valueText: metric(access.straightConnectionGradePercent, 2),
        unit: '%',
        calculationMethod: access.method,
      },
      {
        evidenceType: 'SP_LOT_TERRAIN_STREET_PROFILE_LENGTH',
        locator: 'analysis:surface:access:street-profile:length',
        valueText: metric(access.streetProfile.lengthM, 2),
        unit: 'm',
        calculationMethod: access.method,
      },
      {
        evidenceType: 'SP_LOT_TERRAIN_STREET_GRADE_MEDIAN',
        locator: 'analysis:surface:access:street-profile:grade-median',
        valueText: metric(access.streetProfile.medianAbsoluteGradePercent, 2),
        unit: '%',
        calculationMethod: access.method,
      },
      {
        evidenceType: 'SP_LOT_TERRAIN_STREET_GRADE_P95',
        locator: 'analysis:surface:access:street-profile:grade-p95',
        valueText: metric(access.streetProfile.p95AbsoluteGradePercent, 2),
        unit: '%',
        calculationMethod: access.method,
      },
      {
        evidenceType: 'SP_LOT_TERRAIN_STREET_GRADE_MAX',
        locator: 'analysis:surface:access:street-profile:grade-max',
        valueText: metric(access.streetProfile.maxAbsoluteGradePercent, 2),
        unit: '%',
        calculationMethod: access.method,
      },
    );
  }

  return facts;
}

async function persistEvidence(
  pool: Pool,
  manifestSnapshotId: string,
  lotId: string,
  lotGeometryEvidenceId: string,
  fact: EvidenceFact,
  analysis: TerrainAnalysis,
  inputs: InputSnapshot[],
  streetInput: StreetInput | null,
): Promise<{ id: string; created: boolean }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const identity =
      `${manifestSnapshotId}:${fact.evidenceType}:${SUBJECT_TYPE}:${lotId}:${ANALYSIS_VERSION}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identity]);
    const existing = await client.query<{ id: string }>(
      `SELECT id::text
       FROM evidence.evidence
       WHERE source_snapshot_id = $1::uuid
         AND evidence_type = $2
         AND subject_type = $3
         AND subject_id = $4
         AND locator = $5
         AND parser_version = $6
       LIMIT 1`,
      [
        manifestSnapshotId,
        fact.evidenceType,
        SUBJECT_TYPE,
        lotId,
        fact.locator,
        ANALYSIS_VERSION,
      ],
    );
    let evidenceId = existing.rows[0]?.id;
    const created = !evidenceId;
    if (!evidenceId) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO evidence.evidence (
           source_snapshot_id, evidence_type, subject_type, subject_id,
           locator, value_text, unit, status, geometry,
           calculation_method, parser_version, metadata
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6, $7, 'CALCULADO',
           CASE WHEN $8::text IS NULL THEN NULL
                ELSE ST_SetSRID(ST_GeomFromGeoJSON($8), 4326) END,
           $9, $10, $11::jsonb
         )
         RETURNING id::text`,
        [
          manifestSnapshotId,
          fact.evidenceType,
          SUBJECT_TYPE,
          lotId,
          fact.locator,
          fact.valueText,
          fact.unit ?? null,
          fact.geometry ? JSON.stringify(fact.geometry) : null,
          fact.calculationMethod,
          ANALYSIS_VERSION,
          JSON.stringify({
            analysisVersion: analysis.analysisVersion,
            horizontalCrs: analysis.horizontalCrs,
            verticalDatum: analysis.verticalDatum,
            lotAreaM2: analysis.lotAreaM2,
            pointCount: analysis.pointCount,
            pointDensityPerM2: analysis.pointDensityPerM2,
            inputSheetCodes: inputs.map((input) => input.sheetCode),
            bestFitPlaneRmseM: analysis.bestFitPlane.rmseM,
            localSlopeGridResolutionM: analysis.localSlope.gridResolutionM,
            localSlopeP95Percent: analysis.localSlope.p95Percent,
            localSlopeMaxPercent: analysis.localSlope.maxPercent,
            slopeBands: analysis.localSlope.bands,
            surfaceVersion: analysis.surface.version,
            tinTriangleCount: analysis.surface.tinTriangleCount,
            contourIntervalsM: analysis.surface.contourIntervalsM,
            profileSpacingM: analysis.surface.profiles.spacingM,
            profilePrincipalLengthM: analysis.surface.profiles.principal.lengthM,
            profileTransversalLengthM: analysis.surface.profiles.transversal.lengthM,
            hydrologyBasinCount: analysis.surface.hydrology.basinCount,
            hydrologyOutletCount: analysis.surface.hydrology.outletCount,
            hydrologyPreferredDirectionDegrees:
              analysis.surface.hydrology.preferredRunoffDirectionDegrees,
            hydrologyDepressionMaxFillDepthM:
              analysis.surface.hydrology.depressionScreening.maxFillDepthM,
            accessStatus: analysis.surface.access.status,
            accessSelectedStreetSegmentId:
              analysis.surface.access.selectedSegmentId ?? null,
            accessSelectionMethod: analysis.surface.access.selectionMethod ?? null,
            roadInputSnapshotId: streetInput?.snapshotId ?? null,
            roadInputSha256: streetInput?.sha256 ?? null,
          }),
        ],
      );
      evidenceId = inserted.rows[0]?.id;
    }
    if (!evidenceId) throw new Error('Terrain evidence insert did not return an id');

    for (const input of inputs) {
      await client.query(
        `INSERT INTO evidence.citation (
           evidence_id, source_url, document_title, source_locator
         )
         SELECT $1::uuid, $2, $3, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM evidence.citation
           WHERE evidence_id = $1::uuid
             AND source_locator = $4
             AND COALESCE(source_url, '') = COALESCE($2, '')
         )`,
        [
          evidenceId,
          input.downloadUrl,
          `LoteDiretor — MDT 2020 — folha ${input.sheetCode}`,
          `sheet:${input.sheetCode}`,
        ],
      );
    }

    const isRoadDerived =
      fact.evidenceType.startsWith('SP_LOT_TERRAIN_ACCESS_') ||
      fact.evidenceType.startsWith('SP_LOT_TERRAIN_STREET_');
    if (streetInput && isRoadDerived) {
      await client.query(
        `INSERT INTO evidence.citation (
           evidence_id, source_url, document_title, source_locator
         )
         SELECT $1::uuid, $2, $3, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM evidence.citation
           WHERE evidence_id = $1::uuid
             AND source_locator = $4
             AND COALESCE(source_url, '') = COALESCE($2, '')
         )`,
        [
          evidenceId,
          streetInput.requestUrl,
          'LoteDiretor — segmento viário cadastral',
          `road-snapshot:${streetInput.snapshotId};segment:${String(
            analysis.surface.access.selectedSegmentId ?? 'consulta',
          )}`,
        ],
      );
    }

    await client.query(
      `INSERT INTO evidence.provenance_link (
         evidence_id, parent_evidence_id, relation_type
       )
       SELECT $1::uuid, $2::uuid, 'DERIVED_FROM_LOT_GEOMETRY'
       WHERE NOT EXISTS (
         SELECT 1 FROM evidence.provenance_link
         WHERE evidence_id = $1::uuid
           AND parent_evidence_id = $2::uuid
           AND relation_type = 'DERIVED_FROM_LOT_GEOMETRY'
       )`,
      [evidenceId, lotGeometryEvidenceId],
    );

    await client.query(
      `INSERT INTO evidence.quality_assessment (
         evidence_id, geometry_quality, temporal_quality, source_quality, notes
       )
       SELECT $1::uuid, $2, $3, $4, $5
       WHERE NOT EXISTS (
         SELECT 1 FROM evidence.quality_assessment WHERE evidence_id = $1::uuid
       )`,
      [
        evidenceId,
        'MDT LiDAR clipped to versioned lot geometry',
        'Terrain survey year 2020',
        'Official municipal terrain dataset',
        `CRS ${analysis.horizontalCrs}; vertical datum ${String(
          analysis.verticalDatum ?? 'not declared',
        )}; ${analysis.pointCount} deduplicated points inside lot`,
      ],
    );

    await client.query('COMMIT');
    return { id: evidenceId, created };
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
    application_name: 'lotediretor-terrain-materializer',
    max: 3,
  });
  const s3 = createS3Client();
  const bucket = process.env.S3_SOURCE_BUCKET ?? 'sources';
  const tempRoot = await mkdtemp(join(tmpdir(), 'lotediretor-terrain-'));

  try {
    const [lot, source, address] = await Promise.all([
      loadLotGeometry(pool, options.lotId),
      resolveSource(pool, options.municipalityIbge),
      loadLotAddress(pool, options.lotId),
    ]);

    let streetInput: StreetInput | null = null;
    let streetLookupError: string | null = null;
    let roadSource: RoadSourceConfig | null = null;
    try {
      roadSource = await resolveRoadSource(pool, options.municipalityIbge);
      streetInput = await fetchStreetInput(
        pool,
        s3,
        bucket,
        roadSource,
        lot.geometry_json,
        address,
      );
    } catch (error) {
      streetLookupError =
        error instanceof Error ? error.message : String(error);
      if (roadSource) {
        await pool.query(
          `UPDATE core.source_registry
           SET last_checked_at = now(), ingestion_status = 'degraded', updated_at = now()
           WHERE id = $1::uuid`,
          [roadSource.sourceRegistryId],
        );
      }
    }

    const sheets = await listSheets(source, lot.geometry_json);
    const inputs: InputSnapshot[] = [];
    for (const sheet of sheets) {
      inputs.push(
        await downloadSheet(pool, s3, bucket, source, sheet, tempRoot),
      );
    }

    const analysis = await analyzeTerrain(
      lot.geometry_json,
      inputs,
      address,
      streetInput,
    );
    const manifest = {
      schemaVersion: 1,
      snapshotKind: 'TERRAIN_ANALYSIS',
      analysisVersion: ANALYSIS_VERSION,
      lotId: options.lotId,
      municipalityIbge: options.municipalityIbge,
      lotGeometryEvidenceId: lot.evidence_id,
      lotGeometrySourceSnapshotSha256: lot.source_snapshot_sha256,
      lotGeometrySha256: sha256(stableJson(lot.geometry_json)),
      lotGeometry: lot.geometry_json,
      confirmedAddress: {
        streetName: address.street_name,
        streetNumber: address.street_number,
      },
      roadInput: streetInput
        ? {
            snapshotId: streetInput.snapshotId,
            objectKey: streetInput.objectKey,
            sha256: streetInput.sha256,
            featureCount: streetInput.featureCollection.features.length,
          }
        : null,
      roadLookupError: streetLookupError,
      inputSheets: inputs.map((input) => ({
        sheetCode: input.sheetCode,
        snapshotId: input.snapshotId,
        objectKey: input.objectKey,
        sha256: input.sha256,
        byteSize: input.byteSize,
        year: input.year,
        survey: input.survey,
        scale: input.scale,
      })),
      analysis,
    };
    const manifestBytes = Buffer.from(stableJson(manifest), 'utf8');
    const manifestSha256 = sha256(manifestBytes);
    const manifestObjectKey =
      `derived/${source.sourceCode}/terrain/${options.lotId}/${manifestSha256}.json`;
    await ensureObject(
      s3,
      bucket,
      manifestObjectKey,
      manifestBytes,
      'application/json',
    );
    const manifestSnapshot = await persistSourceSnapshot(
      pool,
      source,
      manifestObjectKey,
      manifestSha256,
      'application/json',
      manifestBytes.length,
      ANALYSIS_VERSION,
      {
        snapshotKind: 'TERRAIN_ANALYSIS',
        requestedLotId: options.lotId,
        analysisVersion: ANALYSIS_VERSION,
        inputSnapshotIds: [
          ...inputs.map((input) => input.snapshotId),
          ...(streetInput ? [streetInput.snapshotId] : []),
        ],
        roadInputSnapshotId: streetInput?.snapshotId ?? null,
        roadLookupError: streetLookupError,
        inputSheetCodes: inputs.map((input) => input.sheetCode),
        lotGeometryEvidenceId: lot.evidence_id,
      },
      analysis.pointCount,
    );

    const facts = factsFromAnalysis(analysis);
    const persisted = [];
    for (const fact of facts) {
      persisted.push(
        await persistEvidence(
          pool,
          manifestSnapshot.id,
          options.lotId,
          lot.evidence_id,
          fact,
          analysis,
          inputs,
          streetInput,
        ),
      );
    }

    await pool.query(
      `UPDATE core.source_registry
       SET last_checked_at = now(), ingestion_status = 'healthy', updated_at = now()
       WHERE id = $1::uuid`,
      [source.sourceRegistryId],
    );

    console.log(
      JSON.stringify({
        lotId: options.lotId,
        analysisVersion: ANALYSIS_VERSION,
        manifestSnapshotId: manifestSnapshot.id,
        inputSheetCodes: inputs.map((input) => input.sheetCode),
        pointCount: analysis.pointCount,
        evidenceCount: facts.length,
        evidenceCreated: persisted.filter((row) => row.created).length,
        elevationMinM: analysis.elevationMinM,
        elevationMaxM: analysis.elevationMaxM,
        reliefAmplitudeM: analysis.reliefAmplitudeM,
        bestFitSlopePercent: analysis.bestFitPlane.slopePercent,
        downslopeAspectDegrees: analysis.bestFitPlane.downslopeAspectDegrees,
        downslopeAspectLabel: analysis.bestFitPlane.downslopeAspectLabel,
        accessStatus: analysis.surface.access.status,
        selectedStreetSegmentId:
          analysis.surface.access.selectedSegmentId ?? null,
        streetCenterlineDistanceM:
          analysis.surface.access.streetCenterlineDistanceM ?? null,
      }),
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
