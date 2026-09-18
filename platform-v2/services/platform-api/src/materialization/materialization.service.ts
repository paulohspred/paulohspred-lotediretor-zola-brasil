import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  MaterializationStatus,
  PropertyMaterializationState,
} from './materialization.types';

type JobRow = {
  id: string;
  municipality_ibge: string;
  subject_type: string;
  subject_id: string;
  status: Exclude<MaterializationStatus, 'UNREQUESTED'>;
  attempt_count: number;
  max_attempts: number;
  requested_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  last_error: string | null;
  evidence_count: string;
};

const JOB_SELECT = `
SELECT
  j.id::text,
  m.ibge_code AS municipality_ibge,
  j.subject_type,
  j.subject_id,
  j.status,
  j.attempt_count,
  j.max_attempts,
  j.requested_at,
  j.started_at,
  j.finished_at,
  j.last_error,
  (
    SELECT count(*)::text
    FROM evidence.evidence e
    WHERE e.subject_type = j.subject_type
      AND e.subject_id = j.subject_id
  ) AS evidence_count
FROM core.property_materialization_job j
JOIN core.municipality m ON m.id = j.municipality_id
`;

@Injectable()
export class MaterializationService {
  constructor(private readonly database: DatabaseService) {}

  async request(
    lotId: string,
    municipalityIbge = '3550308',
    force = false,
  ): Promise<PropertyMaterializationState> {
    const municipality = await this.database.query<{ id: string }>(
      `SELECT id::text
       FROM core.municipality
       WHERE ibge_code = $1
       LIMIT 1`,
      [municipalityIbge],
    );
    const municipalityId = municipality.rows[0]?.id;
    if (!municipalityId) {
      throw new NotFoundException(`Municipality not found: ${municipalityIbge}`);
    }

    if (!force) {
      const existing = await this.database.query<JobRow>(
        `${JOB_SELECT}
         WHERE j.municipality_id = $1::uuid
           AND j.subject_type = 'SP_LOT'
           AND j.subject_id = $2
           AND j.status IN ('QUEUED','RUNNING','SUCCEEDED')
         ORDER BY
           CASE j.status
             WHEN 'RUNNING' THEN 1
             WHEN 'QUEUED' THEN 2
             ELSE 3
           END,
           j.requested_at DESC
         LIMIT 1`,
        [municipalityId, lotId],
      );
      if (existing.rows[0]) return this.mapRow(existing.rows[0]);
    }

    await this.database.query(
      `INSERT INTO core.property_materialization_job (
         municipality_id,
         subject_type,
         subject_id,
         status,
         metadata
       )
       VALUES ($1::uuid, 'SP_LOT', $2, 'QUEUED', $3::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        municipalityId,
        lotId,
        JSON.stringify({
          requestedBy: 'platform-api',
          requestedAt: new Date().toISOString(),
          force,
        }),
      ],
    );

    const queued = await this.latest(lotId, municipalityIbge);
    if (!queued.jobId) {
      throw new Error('Materialization job was not created');
    }
    return queued;
  }

  async latest(
    lotId: string,
    municipalityIbge = '3550308',
  ): Promise<PropertyMaterializationState> {
    const result = await this.database.query<JobRow>(
      `${JOB_SELECT}
       WHERE m.ibge_code = $1
         AND j.subject_type = 'SP_LOT'
         AND j.subject_id = $2
       ORDER BY j.requested_at DESC, j.id DESC
       LIMIT 1`,
      [municipalityIbge, lotId],
    );

    if (result.rows[0]) return this.mapRow(result.rows[0]);

    const evidence = await this.database.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM evidence.evidence
       WHERE subject_type = 'SP_LOT'
         AND subject_id = $1`,
      [lotId],
    );

    return {
      municipalityIbge,
      subjectType: 'SP_LOT',
      subjectId: lotId,
      status: 'UNREQUESTED',
      attemptCount: 0,
      maxAttempts: 3,
      evidenceCount: Number(evidence.rows[0]?.count ?? 0),
    };
  }

  private mapRow(row: JobRow): PropertyMaterializationState {
    return {
      jobId: row.id,
      municipalityIbge: row.municipality_ibge,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      status: row.status,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      evidenceCount: Number(row.evidence_count),
      requestedAt: row.requested_at.toISOString(),
      startedAt: row.started_at?.toISOString(),
      finishedAt: row.finished_at?.toISOString(),
      lastError: row.last_error ?? undefined,
    };
  }
}
