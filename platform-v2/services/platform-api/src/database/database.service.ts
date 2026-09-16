import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      'postgres://lotediretor:change-me-platform-db@127.0.0.1:55432/lotediretor_platform',
    application_name: 'lotediretor-platform-api',
    max: Number(process.env.DB_POOL_MAX ?? 10),
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 10000),
  });

  query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.pool.query<{ ok: number }>('SELECT 1 AS ok');
      return result.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
