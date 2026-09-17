import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  EVIDENCE_STATUS_LABELS,
  EvidenceCitation,
  EvidenceProvenanceLink,
  EvidenceQualityAssessment,
  EvidenceRecord,
  EvidenceSnapshot,
  EvidenceSpatialOverlap,
  EvidenceStatus,
} from './evidence.types';

export type EvidenceFilters = {
  municipalityIbge?: string;
  sourceCode?: string;
  evidenceType?: string;
  subjectType?: string;
  subjectId?: string;
  locator?: string;
  status?: EvidenceStatus;
  limit?: number;
};

type EvidenceRow = {
  id: string;
  evidence_type: string;
  subject_type: string | null;
  subject_id: string | null;
  locator: string | null;
  value_text: string | null;
  unit: string | null;
  status: EvidenceStatus;
  valid_from: Date | null;
  valid_to: Date | null;
  recorded_at: Date;
  calculation_method: string | null;
  parser_version: string | null;
  spatial_overlap: EvidenceSpatialOverlap | null;
  snapshot: EvidenceSnapshot;
  citations: EvidenceCitation[] | null;
  quality_assessment: EvidenceQualityAssessment | null;
  provenance: EvidenceProvenanceLink[] | null;
};

const BASE_QUERY = `
SELECT
  e.id::text,
  e.evidence_type,
  e.subject_type,
  e.subject_id,
  e.locator,
  e.value_text,
  e.unit,
  e.status,
  e.valid_from,
  e.valid_to,
  e.recorded_at,
  e.calculation_method,
  e.parser_version,
  CASE
    WHEN e.metadata ? 'intersectionAreaM2'
      AND e.metadata ? 'lotGeometryAreaM2'
      AND e.metadata ? 'shareOfLotGeometry'
    THEN jsonb_build_object(
      'intersectionAreaM2', (e.metadata->>'intersectionAreaM2')::double precision,
      'subjectGeometryAreaM2', (e.metadata->>'lotGeometryAreaM2')::double precision,
      'subjectCoverageRatio', (e.metadata->>'shareOfLotGeometry')::double precision
    )
    ELSE NULL
  END AS spatial_overlap,
  jsonb_build_object(
    'id', ss.id::text,
    'sourceCode', sr.source_code,
    'datasetCode', sr.dataset_code,
    'authority', sr.authority,
    'objectKey', ss.object_key,
    'sha256', ss.sha256,
    'sourcePublishedAt', ss.source_published_at,
    'ingestedAt', ss.ingested_at,
    'parserVersion', ss.parser_version
  ) AS snapshot,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id::text,
          'sourceUrl', c.source_url,
          'documentTitle', c.document_title,
          'sourceLocator', c.source_locator,
          'quotedText', c.quoted_text
        ) ORDER BY c.created_at, c.id
      )
      FROM evidence.citation c
      WHERE c.evidence_id = e.id
    ),
    '[]'::jsonb
  ) AS citations,
  (
    SELECT jsonb_build_object(
      'id', qa.id::text,
      'geometryQuality', qa.geometry_quality,
      'temporalQuality', qa.temporal_quality,
      'sourceQuality', qa.source_quality,
      'confidence', qa.confidence,
      'notes', qa.notes,
      'assessedAt', qa.assessed_at
    )
    FROM evidence.quality_assessment qa
    WHERE qa.evidence_id = e.id
    ORDER BY qa.assessed_at DESC, qa.id DESC
    LIMIT 1
  ) AS quality_assessment,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pl.id::text,
          'relationType', pl.relation_type,
          'parentEvidenceId', pl.parent_evidence_id::text
        ) ORDER BY pl.created_at, pl.id
      )
      FROM evidence.provenance_link pl
      WHERE pl.evidence_id = e.id
    ),
    '[]'::jsonb
  ) AS provenance
FROM evidence.evidence e
JOIN core.source_snapshot ss ON ss.id = e.source_snapshot_id
JOIN core.source_registry sr ON sr.id = ss.source_registry_id
LEFT JOIN core.municipality m ON m.id = sr.municipality_id
`;

@Injectable()
export class EvidenceService {
  constructor(private readonly database: DatabaseService) {}

  async list(filters: EvidenceFilters = {}): Promise<EvidenceRecord[]> {
    const requestedLimit = filters.limit;
    const normalizedLimit =
      requestedLimit !== undefined && Number.isFinite(requestedLimit)
        ? Math.trunc(requestedLimit)
        : 100;
    const limit = Math.min(Math.max(normalizedLimit, 1), 500);
    const result = await this.database.query<EvidenceRow>(
      `${BASE_QUERY}
       WHERE ($1::text IS NULL OR m.ibge_code = $1)
         AND ($2::text IS NULL OR sr.source_code = $2)
         AND ($3::text IS NULL OR e.evidence_type = $3)
         AND ($4::text IS NULL OR e.subject_type = $4)
         AND ($5::text IS NULL OR e.subject_id = $5)
         AND ($6::text IS NULL OR e.locator = $6)
         AND ($7::text IS NULL OR e.status = $7)
       ORDER BY e.recorded_at DESC, e.id
       LIMIT $8`,
      [
        filters.municipalityIbge ?? null,
        filters.sourceCode ?? null,
        filters.evidenceType ?? null,
        filters.subjectType ?? null,
        filters.subjectId ?? null,
        filters.locator ?? null,
        filters.status ?? null,
        limit,
      ],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findOne(id: string): Promise<EvidenceRecord | null> {
    const result = await this.database.query<EvidenceRow>(
      `${BASE_QUERY}
       WHERE e.id::text = $1
       LIMIT 1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  private mapRow(row: EvidenceRow): EvidenceRecord {
    return {
      id: row.id,
      evidenceType: row.evidence_type,
      subjectType: row.subject_type ?? undefined,
      subjectId: row.subject_id ?? undefined,
      locator: row.locator ?? undefined,
      valueText: row.value_text ?? undefined,
      unit: row.unit ?? undefined,
      status: row.status,
      statusLabel: EVIDENCE_STATUS_LABELS[row.status],
      validFrom: row.valid_from?.toISOString(),
      validTo: row.valid_to?.toISOString(),
      recordedAt: row.recorded_at.toISOString(),
      calculationMethod: row.calculation_method ?? undefined,
      parserVersion: row.parser_version ?? undefined,
      spatialOverlap: row.spatial_overlap ?? undefined,
      snapshot: row.snapshot,
      citations: row.citations ?? [],
      qualityAssessment: row.quality_assessment ?? undefined,
      provenance: row.provenance ?? [],
    };
  }
}
