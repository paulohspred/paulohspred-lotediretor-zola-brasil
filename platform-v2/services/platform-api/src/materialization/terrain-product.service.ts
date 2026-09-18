import { createHash } from 'node:crypto';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

const SOURCE_CODE = 'PMSP_TERRITORIO_TOPOGRAFIA';
const ANALYSIS_VERSION = 'terrain-mdt-2020-surface-v4';

type SnapshotRow = {
  id: string;
  object_key: string;
  sha256: string;
  ingested_at: Date;
  parser_version: string | null;
};

type TerrainManifest = {
  lotId: string;
  municipalityIbge: string;
  analysisVersion: string;
  analysis: {
    analysisVersion: string;
    horizontalCrs: string;
    verticalDatum: unknown;
    elevationMinM: number;
    elevationMaxM: number;
    elevationMeanM: number;
    elevationMedianM: number;
    reliefAmplitudeM: number;
    bestFitPlane: Record<string, unknown>;
    localSlope: Record<string, unknown>;
    surface: {
      version: string;
      grid: Record<string, unknown>;
      tin: Record<string, unknown>;
      contours: Record<string, Record<string, unknown>>;
      contourIntervalsM: number[];
      tinTriangleCount: number;
      tinAreaWeightedMeanSlopePercent: number | null;
      profiles: Record<string, unknown>;
      hydrology: Record<string, unknown>;
    };
  };
};

@Injectable()
export class TerrainProductService {
  private readonly bucket = process.env.S3_SOURCE_BUCKET ?? 'sources';

  private readonly s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:59000',
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId:
        process.env.S3_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? 'lotediretor',
      secretAccessKey:
        process.env.S3_SECRET_KEY ??
        process.env.MINIO_ROOT_PASSWORD ??
        'change-me-minio-secret',
    },
  });

  constructor(private readonly database: DatabaseService) {}

  async getProduct(
    lotId: string,
    municipalityIbge = '3550308',
    contourIntervalM = 1,
  ): Promise<Record<string, unknown>> {
    const intervalKey = this.intervalKey(contourIntervalM);
    const snapshot = await this.latestSnapshot(lotId, municipalityIbge);
    if (!snapshot) {
      throw new NotFoundException(
        `Terrain surface product not found for lot ${lotId}`,
      );
    }

    const object = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: snapshot.object_key }),
    );
    const body = object.Body as
      | { transformToString(encoding?: string): Promise<string> }
      | undefined;
    if (!body?.transformToString) {
      throw new Error('Terrain manifest body is unavailable');
    }
    const text = await body.transformToString('utf-8');
    const digest = createHash('sha256').update(text, 'utf8').digest('hex');
    if (digest !== snapshot.sha256) {
      throw new Error(
        `Terrain manifest SHA-256 mismatch for snapshot ${snapshot.id}`,
      );
    }

    const manifest = JSON.parse(text) as TerrainManifest;
    if (manifest.lotId !== lotId || manifest.municipalityIbge !== municipalityIbge) {
      throw new Error('Terrain manifest subject does not match request');
    }
    if (manifest.analysisVersion !== ANALYSIS_VERSION) {
      throw new Error(
        `Unexpected terrain analysis version: ${manifest.analysisVersion}`,
      );
    }
    const analysis = manifest.analysis;
    const contour = analysis.surface.contours[intervalKey] ?? {
      type: 'FeatureCollection',
      features: [],
    };

    return {
      lotId,
      municipalityIbge,
      snapshot: {
        id: snapshot.id,
        sha256: snapshot.sha256,
        ingestedAt: snapshot.ingested_at.toISOString(),
        parserVersion: snapshot.parser_version,
      },
      analysisVersion: analysis.analysisVersion,
      horizontalCrs: analysis.horizontalCrs,
      verticalDatum: analysis.verticalDatum,
      metrics: {
        elevationMinM: analysis.elevationMinM,
        elevationMaxM: analysis.elevationMaxM,
        elevationMeanM: analysis.elevationMeanM,
        elevationMedianM: analysis.elevationMedianM,
        reliefAmplitudeM: analysis.reliefAmplitudeM,
        bestFitPlane: analysis.bestFitPlane,
        localSlope: analysis.localSlope,
      },
      surface: {
        version: analysis.surface.version,
        grid: analysis.surface.grid,
        tin: analysis.surface.tin,
        tinTriangleCount: analysis.surface.tinTriangleCount,
        tinAreaWeightedMeanSlopePercent:
          analysis.surface.tinAreaWeightedMeanSlopePercent,
        contourIntervalM,
        contours: contour,
        availableContourIntervalsM: analysis.surface.contourIntervalsM,
        profiles: analysis.surface.profiles,
        hydrology: analysis.surface.hydrology,
      },
    };
  }

  private intervalKey(value: number): string {
    const normalized = Number(value);
    const keyByValue = new Map<number, string>([
      [0.5, '0.5'],
      [1, '1.0'],
      [2, '2.0'],
      [5, '5.0'],
    ]);
    const key = keyByValue.get(normalized);
    if (!key) {
      throw new Error('contourIntervalM must be one of 0.5, 1, 2 or 5');
    }
    return key;
  }

  private async latestSnapshot(
    lotId: string,
    municipalityIbge: string,
  ): Promise<SnapshotRow | null> {
    const result = await this.database.query<SnapshotRow>(
      `SELECT
         ss.id::text,
         ss.object_key,
         ss.sha256,
         ss.ingested_at,
         ss.parser_version
       FROM core.source_snapshot ss
       JOIN core.source_registry sr ON sr.id = ss.source_registry_id
       JOIN core.municipality m ON m.id = sr.municipality_id
       WHERE m.ibge_code = $1
         AND sr.source_code = $2
         AND EXISTS (
           SELECT 1
           FROM evidence.evidence e
           WHERE e.source_snapshot_id = ss.id
             AND e.subject_type = 'SP_LOT'
             AND e.subject_id = $3
             AND e.parser_version = $4
             AND e.evidence_type = 'SP_LOT_TERRAIN_SURFACE_MODEL'
         )
       ORDER BY ss.ingested_at DESC, ss.id DESC
       LIMIT 1`,
      [municipalityIbge, SOURCE_CODE, lotId, ANALYSIS_VERSION],
    );
    return result.rows[0] ?? null;
  }
}
