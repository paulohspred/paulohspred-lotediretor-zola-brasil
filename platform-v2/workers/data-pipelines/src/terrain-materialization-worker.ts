import { execFile } from 'node:child_process';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Pool, PoolClient } from 'pg';

type JobRow = {
  id: string;
  municipality_ibge: string;
  subject_type: string;
  subject_id: string;
  attempt_count: number;
  max_attempts: number;
};

type JsonResult = Record<string, unknown>;

const execFileAsync = promisify(execFile);
const pollMs = Math.max(500, Number(process.env.TERRAIN_MATERIALIZATION_POLL_MS ?? 2500));
const staleAfterMinutes = Math.max(
  10,
  Number(process.env.TERRAIN_MATERIALIZATION_STALE_MINUTES ?? 30),
);
const workerId = `${hostname()}:${process.pid}`;
let stopping = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runJsonScript(
  scriptName: string,
  args: string[],
): Promise<JsonResult> {
  const scriptPath = fileURLToPath(new URL(`./${scriptName}`, import.meta.url));
  const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 360_000,
  });
  const stdout = String(result.stdout ?? '').trim();
  const lines = stdout.split('\n').filter(Boolean);
  const lastLine = lines.at(-1);
  if (!lastLine) throw new Error(`${scriptName} returned no JSON output`);
  try {
    return JSON.parse(lastLine) as JsonResult;
  } catch {
    throw new Error(`${scriptName} returned invalid JSON: ${lastLine.slice(0, 500)}`);
  }
}

async function claimJob(pool: Pool): Promise<JobRow | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query<JobRow>(
      `SELECT
         j.id::text,
         m.ibge_code AS municipality_ibge,
         j.subject_type,
         j.subject_id,
         j.attempt_count,
         j.max_attempts
       FROM core.terrain_materialization_job j
       JOIN core.municipality m ON m.id = j.municipality_id
       WHERE j.status = 'QUEUED'
         AND j.next_attempt_at <= now()
         AND j.attempt_count < j.max_attempts
       ORDER BY j.requested_at, j.id
       FOR UPDATE OF j SKIP LOCKED
       LIMIT 1`,
    );
    const job = selected.rows[0];
    if (!job) {
      await client.query('COMMIT');
      return null;
    }

    await client.query(
      `UPDATE core.terrain_materialization_job
       SET status = 'RUNNING',
           attempt_count = attempt_count + 1,
           started_at = now(),
           finished_at = NULL,
           worker_id = $2,
           updated_at = now()
       WHERE id = $1::uuid`,
      [job.id, workerId],
    );
    await client.query('COMMIT');
    return { ...job, attempt_count: job.attempt_count + 1 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function recoverStaleJobs(pool: Pool): Promise<void> {
  await pool.query(
    `UPDATE core.terrain_materialization_job
     SET status = CASE
           WHEN attempt_count < max_attempts THEN 'QUEUED'
           ELSE 'FAILED'
         END,
         next_attempt_at = now(),
         finished_at = CASE
           WHEN attempt_count < max_attempts THEN NULL
           ELSE now()
         END,
         worker_id = NULL,
         last_error = COALESCE(last_error, 'Worker interrupted before completion'),
         updated_at = now()
     WHERE status = 'RUNNING'
       AND started_at < now() - make_interval(mins => $1)`,
    [staleAfterMinutes],
  );
}

async function markSucceeded(
  pool: Pool,
  job: JobRow,
  result: JsonResult,
): Promise<void> {
  await pool.query(
    `UPDATE core.terrain_materialization_job
     SET status = 'SUCCEEDED',
         finished_at = now(),
         worker_id = $2,
         last_error = NULL,
         metadata = metadata || jsonb_build_object('result', $3::jsonb),
         updated_at = now()
     WHERE id = $1::uuid`,
    [job.id, workerId, JSON.stringify(result)],
  );
}

async function markFailed(pool: Pool, job: JobRow, error: unknown): Promise<void> {
  const message =
    error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000);
  await pool.query(
    `UPDATE core.terrain_materialization_job
     SET status = CASE
           WHEN attempt_count < max_attempts THEN 'QUEUED'
           ELSE 'FAILED'
         END,
         next_attempt_at = CASE
           WHEN attempt_count < max_attempts
             THEN now() + make_interval(secs => LEAST(300, attempt_count * 30))
           ELSE next_attempt_at
         END,
         finished_at = CASE
           WHEN attempt_count < max_attempts THEN NULL
           ELSE now()
         END,
         worker_id = CASE
           WHEN attempt_count < max_attempts THEN NULL
           ELSE $2
         END,
         last_error = $3,
         updated_at = now()
     WHERE id = $1::uuid`,
    [job.id, workerId, message],
  );
}

async function materialize(job: JobRow): Promise<JsonResult> {
  if (job.subject_type !== 'SP_LOT') {
    throw new Error('Unsupported terrain subject type');
  }

  return runJsonScript('materialize-terrain.js', [
    '--municipality-ibge',
    job.municipality_ibge,
    '--lot-id',
    job.subject_id,
  ]);
}

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      'postgres://lotediretor:change-me-platform-db@127.0.0.1:55432/lotediretor_platform',
    application_name: 'lotediretor-terrain-materialization-worker',
    max: 3,
  });

  process.on('SIGTERM', () => {
    stopping = true;
  });
  process.on('SIGINT', () => {
    stopping = true;
  });

  try {
    await recoverStaleJobs(pool);
    console.log(
      JSON.stringify({
        event: 'terrain-materialization-worker-started',
        workerId,
        pollMs,
      }),
    );

    while (!stopping) {
      const job = await claimJob(pool);
      if (!job) {
        await delay(pollMs);
        continue;
      }

      console.log(
        JSON.stringify({
          event: 'terrain-materialization-started',
          jobId: job.id,
          subjectId: job.subject_id,
          attempt: job.attempt_count,
        }),
      );

      try {
        const result = await materialize(job);
        await markSucceeded(pool, job, result);
        console.log(
          JSON.stringify({
            event: 'terrain-materialization-succeeded',
            jobId: job.id,
            subjectId: job.subject_id,
            result,
          }),
        );
      } catch (error) {
        await markFailed(pool, job, error);
        console.error(
          JSON.stringify({
            event: 'terrain-materialization-failed',
            jobId: job.id,
            subjectId: job.subject_id,
            attempt: job.attempt_count,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
