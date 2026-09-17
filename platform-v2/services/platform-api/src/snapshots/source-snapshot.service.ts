import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SourceSnapshotRecord } from './source-snapshot.types';

export type SourceSnapshotFilters = {
  municipalityIbge?: string;
  sourceCode?: string;
  sha256?: string;
  limit?: number;
};

type SourceSnapshotRow = {
  id: string;
  source_registry_id: string;
  municipality_ibge: string | null;
  municipality_name: string | null;
  source_code: string;
  dataset_code: string;
  authority: string;
  access_class: string;
  object_key: string;
  sha256: string;
  media_type: string | null;
  byte_size: string | null;
  source_published_at: Date | null;
  ingested_at: Date;
  parser_version: string | null;
  schema_fingerprint: string | null;
  feature_count: string | null;
};

const BASE_QUERY = `
SELECT
  ss.id::text,
  ss.source_registry_id::text,
  m.ibge_code AS municipality_ibge,
  m.name AS municipality_name,
  sr.source_code,
  sr.dataset_code,
  sr.authority,
  sr.access_class,
  ss.object_key,
  ss.sha256,
  ss.media_type,
  ss.byte_size::text,
  ss.source_published_at,
  ss.ingested_at,
  ss.parser_version,
  ss.schema_fingerprint,
  ss.feature_count::text
FROM core.source_snapshot ss
JOIN core.source_registry sr ON sr.id = ss.source_registry_id
LEFT JOIN core.municipality m ON m.id = sr.municipality_id
`;

@Injectable()
export class SourceSnapshotService {
  constructor(private readonly database: DatabaseService) {}

  async list(filters: SourceSnapshotFilters = {}): Promise<SourceSnapshotRecord[]> {
    const requestedLimit = filters.limit;
    const normalizedLimit =
      requestedLimit !== undefined && Number.isFinite(requestedLimit)
        ? Math.trunc(requestedLimit)
        : 100;
    const limit = Math.min(Math.max(normalizedLimit, 1), 500);

    const result = await this.database.query<SourceSnapshotRow>(
      `${BASE_QUERY}
       WHERE ($1::text IS NULL OR m.ibge_code = $1)
         AND ($2::text IS NULL OR sr.source_code = $2)
         AND ($3::text IS NULL OR ss.sha256 = $3)
       ORDER BY ss.ingested_at DESC, ss.id
       LIMIT $4`,
      [filters.municipalityIbge ?? null, filters.sourceCode ?? null, filters.sha256 ?? null, limit],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findOne(id: string): Promise<SourceSnapshotRecord | null> {
    const result = await this.database.query<SourceSnapshotRow>(
      `${BASE_QUERY}
       WHERE ss.id::text = $1
       LIMIT 1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  private mapRow(row: SourceSnapshotRow): SourceSnapshotRecord {
    return {
      id: row.id,
      sourceRegistryId: row.source_registry_id,
      municipalityIbge: row.municipality_ibge ?? undefined,
      municipalityName: row.municipality_name ?? undefined,
      sourceCode: row.source_code,
      datasetCode: row.dataset_code,
      authority: row.authority,
      accessClass: row.access_class,
      objectKey: row.object_key,
      sha256: row.sha256,
      mediaType: row.media_type ?? undefined,
      byteSize: row.byte_size ?? undefined,
      sourcePublishedAt: row.source_published_at?.toISOString(),
      ingestedAt: row.ingested_at.toISOString(),
      parserVersion: row.parser_version ?? undefined,
      schemaFingerprint: row.schema_fingerprint ?? undefined,
      featureCount: row.feature_count ?? undefined,
    };
  }
}
