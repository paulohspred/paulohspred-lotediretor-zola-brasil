import { PoolClient } from 'pg';

const ASSESSMENT_NOTE =
  'AUTO_SPATIAL_INTEGRITY_V1: verifica integridade técnica, snapshot, citação e proveniência geométrica; não avalia atualidade jurídica, gravidade de risco ou adequação normativa.';

export async function ensureSpatialIntegrityAssessment(
  client: PoolClient,
  evidenceId: string,
): Promise<boolean> {
  const result = await client.query<{
    status: string;
    metadata: Record<string, unknown> | null;
    sha256: string;
    citation_count: string;
    geometry_parent_count: string;
  }>(
    `SELECT e.status,
            e.metadata,
            ss.sha256,
            (SELECT count(*)::text FROM evidence.citation c WHERE c.evidence_id = e.id) AS citation_count,
            (
              SELECT count(*)::text
              FROM evidence.provenance_link pl
              JOIN evidence.evidence parent ON parent.id = pl.parent_evidence_id
              WHERE pl.evidence_id = e.id
                AND pl.relation_type = 'SPATIAL_INTERSECTION_INPUT'
                AND parent.evidence_type = 'SP_LOT_GEOMETRY'
                AND parent.status = 'CONFIRMADO'
                AND parent.geometry IS NOT NULL
            ) AS geometry_parent_count
     FROM evidence.evidence e
     JOIN core.source_snapshot ss ON ss.id = e.source_snapshot_id
     WHERE e.id = $1::uuid`,
    [evidenceId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Evidence not found for integrity assessment: ${evidenceId}`);
  if (row.status !== 'CALCULADO') {
    throw new Error(`Spatial integrity assessment requires CALCULADO evidence: ${evidenceId}`);
  }

  const metadata = row.metadata ?? {};
  const intersectionAreaM2 = Number(metadata.intersectionAreaM2);
  const lotGeometryAreaM2 = Number(metadata.lotGeometryAreaM2);
  const shareOfLotGeometry = Number(metadata.shareOfLotGeometry);
  const metricsValid =
    Number.isFinite(intersectionAreaM2) &&
    Number.isFinite(lotGeometryAreaM2) &&
    Number.isFinite(shareOfLotGeometry) &&
    intersectionAreaM2 > 0 &&
    lotGeometryAreaM2 > 0 &&
    shareOfLotGeometry >= 0 &&
    shareOfLotGeometry <= 1.000001;
  if (!metricsValid) {
    throw new Error(`Spatial integrity assessment found invalid overlap metrics: ${evidenceId}`);
  }
  if (!/^[a-f0-9]{64}$/i.test(row.sha256)) {
    throw new Error(`Spatial integrity assessment found invalid snapshot SHA-256: ${evidenceId}`);
  }
  if (Number(row.citation_count) < 1) {
    throw new Error(`Spatial integrity assessment requires at least one citation: ${evidenceId}`);
  }
  if (Number(row.geometry_parent_count) < 1) {
    throw new Error(`Spatial integrity assessment requires confirmed geometry provenance: ${evidenceId}`);
  }

  const existing = await client.query<{ id: string }>(
    `SELECT id::text
     FROM evidence.quality_assessment
     WHERE evidence_id = $1::uuid
       AND notes = $2
     LIMIT 1`,
    [evidenceId, ASSESSMENT_NOTE],
  );
  if (existing.rowCount) return false;

  await client.query(
    `INSERT INTO evidence.quality_assessment (
       evidence_id, geometry_quality, temporal_quality, source_quality, confidence, notes
     ) VALUES ($1::uuid, $2, $3, $4, NULL, $5)`,
    [
      evidenceId,
      'EXACT_2D_OVERLAP',
      'VERSIONED_SNAPSHOT_NOT_FRESHNESS_ASSESSED',
      'REGISTERED_SOURCE_WITH_CITATION',
      ASSESSMENT_NOTE,
    ],
  );
  return true;
}
