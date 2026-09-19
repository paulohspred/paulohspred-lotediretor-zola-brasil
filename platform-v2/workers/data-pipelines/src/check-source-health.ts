import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const HTTP_TIMEOUT_MS = Number(process.env.SOURCE_HEALTH_TIMEOUT_MS ?? 10000);

type Source = {
  id: string;
  sourceCode: string;
  endpoints: Array<{ method: string; url: string; healthProbe?: boolean }>;
};

async function probe(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { Range: 'bytes=0-0', 'User-Agent': 'LoteDiretor-SourceHealth/1.0' },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    await response.body?.cancel();
    return {
      ok: response.status >= 200 && response.status < 400,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const result = await pool.query<{
      id: string;
      source_code: string;
      endpoints: Array<{ method: string; url: string; healthProbe?: boolean }> | null;
    }>(`
      SELECT
        sr.id::text,
        sr.source_code,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'method', se.method,
              'url', se.url,
              'healthProbe', COALESCE((se.metadata ->> 'healthProbe')::boolean, true)
            )
            ORDER BY se.endpoint_type, se.url
          ) FILTER (WHERE se.id IS NOT NULL AND se.enabled = true),
          '[]'::jsonb
        ) AS endpoints
      FROM core.source_registry sr
      LEFT JOIN core.source_endpoint se ON se.source_registry_id = sr.id
      GROUP BY sr.id, sr.source_code
      ORDER BY sr.source_code
    `);

    const sources: Source[] = result.rows.map((row) => ({
      id: row.id,
      sourceCode: row.source_code,
      endpoints: row.endpoints ?? [],
    }));

    for (const source of sources) {
      const safeEndpoints = source.endpoints.filter(
        (endpoint) =>
          endpoint.method.toUpperCase() === 'GET' && endpoint.healthProbe !== false,
      );

      if (safeEndpoints.length === 0) {
        await pool.query(
          `UPDATE core.source_registry
           SET ingestion_status = 'manual',
               last_checked_at = now(),
               health_error = 'No safe GET health probe configured',
               updated_at = now()
           WHERE id = $1::uuid`,
          [source.id],
        );
        console.log(JSON.stringify({ sourceCode: source.sourceCode, status: 'manual' }));
        continue;
      }

      const checks = await Promise.all(safeEndpoints.map((endpoint) => probe(endpoint.url)));
      const successCount = checks.filter((check) => check.ok).length;
      const status =
        successCount === safeEndpoints.length
          ? 'healthy'
          : successCount > 0
            ? 'degraded'
            : 'broken';
      const error =
        status === 'healthy'
          ? null
          : checks
              .map((check, index) => `${safeEndpoints[index].url}: ${check.detail}`)
              .join('; ')
              .slice(0, 4000);

      await pool.query(
        `UPDATE core.source_registry
         SET ingestion_status = $2,
             last_checked_at = now(),
             last_success_at = CASE WHEN $3::boolean THEN now() ELSE last_success_at END,
             health_error = $4,
             updated_at = now()
         WHERE id = $1::uuid`,
        [source.id, status, successCount > 0, error],
      );

      console.log(
        JSON.stringify({
          sourceCode: source.sourceCode,
          status,
          successCount,
          endpointCount: safeEndpoints.length,
        }),
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
