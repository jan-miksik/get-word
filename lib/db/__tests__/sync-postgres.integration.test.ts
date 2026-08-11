import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

describe.skipIf(!runIntegration)('sync PostgreSQL migration and concurrency guards', () => {
  let sql: Sql;
  let userId: string;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for DB integration tests');
    sql = postgres(databaseUrl, { max: 1, prepare: false });
    const [user] = await sql<{ id: string }[]>`
      insert into users (device_id)
      values (${`db-integration-${crypto.randomUUID()}`})
      returning id
    `;
    userId = user.id;
  });

  afterAll(async () => {
    if (sql && userId) await sql`delete from users where id = ${userId}`;
    if (sql) await sql.end();
  });

  it('installs revision columns and the idempotency ledger', async () => {
    const columns = await sql<{ column_name: string }[]>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'users'
        and column_name in ('settings_language_revision', 'language_pair_revision')
    `;
    expect(columns.map((row) => row.column_name).sort()).toEqual([
      'language_pair_revision',
      'settings_language_revision',
    ]);
    const [ledger] = await sql<{ table_name: string | null }[]>`
      select to_regclass('public.sync_applied_operations')::text as table_name
    `;
    expect(ledger.table_name).toBe('sync_applied_operations');
  });

  it('allows exactly one writer for the same base revision', async () => {
    const first = await sql<{ settings_language_revision: number }[]>`
      update users
      set settings_language = 'de',
          settings_language_revision = settings_language_revision + 1
      where id = ${userId} and settings_language_revision = 0
      returning settings_language_revision
    `;
    const stale = await sql<{ settings_language_revision: number }[]>`
      update users
      set settings_language = 'fr',
          settings_language_revision = settings_language_revision + 1
      where id = ${userId} and settings_language_revision = 0
      returning settings_language_revision
    `;

    expect(first).toEqual([{ settings_language_revision: 1 }]);
    expect(stale).toEqual([]);
  });

  it('deduplicates client operation ids per user', async () => {
    const clientOpId = crypto.randomUUID();
    const first = await sql<{ client_op_id: string }[]>`
      insert into sync_applied_operations (user_id, client_op_id)
      values (${userId}, ${clientOpId})
      on conflict do nothing
      returning client_op_id
    `;
    const duplicate = await sql<{ client_op_id: string }[]>`
      insert into sync_applied_operations (user_id, client_op_id)
      values (${userId}, ${clientOpId})
      on conflict do nothing
      returning client_op_id
    `;

    expect(first).toEqual([{ client_op_id: clientOpId }]);
    expect(duplicate).toEqual([]);
  });
});
