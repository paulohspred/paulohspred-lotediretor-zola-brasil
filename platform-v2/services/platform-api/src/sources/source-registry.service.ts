import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SourceEndpoint, SourceRegistryEntry } from './source-registry.types';

type SourceRow = {
  id: string;
  municipality_ibge: string | null;
  municipality_name: string | null;
  source_code: string;
  source_type: string;
  authority: string;
  dataset_code: string;
  access_class: string;
  parser_version: string | null;
  cadence: string | null;
  ingestion_status: string;
  last_checked_at: Date | null;
  endpoints: Array<{ type: string; url: string; method: string }> | null;
};

const BASE_QUERY = `
SELECT
  sr.id::text,
  m.ibge_code AS municipality_ibge,
  m.name AS municipality_name,
  sr.source_code,
  sr.source_type,
  sr.authority,
  sr.dataset_code,
  sr.access_class,
  sr.parser_version,
  sr.cadence,
  sr.ingestion_status,
  sr.last_checked_at,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'type', se.endpoint_type,
        'url', se.url,
        'method', se.method
      ) ORDER BY se.endpoint_type, se.url
    ) FILTER (WHERE se.id IS NOT NULL),
    '[]'::jsonb
  ) AS endpoints
FROM core.source_registry sr
LEFT JOIN core.municipality m ON m.id = sr.municipality_id
LEFT JOIN core.source_endpoint se
  ON se.source_registry_id = sr.id
 AND se.enabled = true
`;

const GROUP_BY = `
GROUP BY sr.id, m.ibge_code, m.name
`;

@Injectable()
export class SourceRegistryService {
  constructor(private readonly database: DatabaseService) {}

  async list(municipalityIbge?: string): Promise<SourceRegistryEntry[]> {
    const result = await this.database.query<SourceRow>(
      `${BASE_QUERY}
       WHERE ($1::text IS NULL OR m.ibge_code = $1)
       ${GROUP_BY}
       ORDER BY sr.source_code`,
      [municipalityIbge ?? null],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findOne(sourceCode: string, municipalityIbge?: string): Promise<SourceRegistryEntry | null> {
    const result = await this.database.query<SourceRow>(
      `${BASE_QUERY}
       WHERE sr.source_code = $1
         AND ($2::text IS NULL OR m.ibge_code = $2)
       ${GROUP_BY}
       LIMIT 1`,
      [sourceCode, municipalityIbge ?? null],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  private mapRow(row: SourceRow): SourceRegistryEntry {
    return {
      id: row.id,
      municipalityIbge: row.municipality_ibge ?? undefined,
      municipalityName: row.municipality_name ?? undefined,
      sourceCode: row.source_code,
      sourceType: row.source_type,
      authority: row.authority,
      datasetCode: row.dataset_code,
      accessClass: row.access_class,
      parserVersion: row.parser_version ?? undefined,
      cadence: row.cadence ?? undefined,
      ingestionStatus: row.ingestion_status,
      lastCheckedAt: row.last_checked_at?.toISOString(),
      endpoints: (row.endpoints ?? []).map(
        (endpoint): SourceEndpoint => ({
          type: endpoint.type,
          url: endpoint.url,
          method: endpoint.method,
        }),
      ),
    };
  }
}
