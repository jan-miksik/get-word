/**
 * Parity between the SQL pool key and the TypeScript normalization it mirrors.
 *
 * The pool key is defined ONCE, in SQL. That removes drift between callers but
 * creates a different risk: the SQL normalization silently diverging from
 * `normalizeText` in lib/progress-key.ts, which is the behaviour it is meant
 * to reproduce. Only a real PostgreSQL can settle that — `normalize(t, NFC)`,
 * `regexp_replace`, and `char_length` have no faithful stand-in.
 *
 * Skipped when no database is reachable, so the suite still runs offline.
 */

import * as dotenv from 'dotenv';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { normalizeText } from '@/lib/progress-key';

dotenv.config({ path: '.env.local', quiet: true });

const DATABASE_URL = process.env.DATABASE_URL;

type SqlClient = {
  unsafe: (query: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
  end: () => Promise<void>;
};

let sql: SqlClient;

/** Mirrors `poolKeyExpression`, parameterized so fixtures can be fed in. */
const KEY_SQL = `
  SELECT 'p1:' || md5(concat_ws('|',
    char_length(lower($1::text)) || ':' || lower($1::text),
    char_length(lower($2::text)) || ':' || lower($2::text),
    char_length(n.k) || ':' || n.k,
    char_length(n.t) || ':' || n.t
  )) AS key, n.k AS norm_known, n.t AS norm_target
  FROM (SELECT
    btrim(regexp_replace(regexp_replace(btrim(normalize($3::text, NFC)), '\\s+', ' ', 'g'), '\\.+$', '')) AS k,
    btrim(regexp_replace(regexp_replace(btrim(normalize($4::text, NFC)), '\\s+', ' ', 'g'), '\\.+$', '')) AS t
  ) n`;

async function poolKey(from: string, to: string, known: string, target: string) {
  const rows = await sql.unsafe(KEY_SQL, [from, to, known, target]);
  return rows[0] as { key: string; norm_known: string; norm_target: string };
}

describe.skipIf(!DATABASE_URL)('pool key against a real PostgreSQL', () => {
  beforeAll(async () => {
    const postgres = (await import('postgres')).default;
    sql = postgres(DATABASE_URL!, { max: 1 }) as unknown as SqlClient;
  });

  afterAll(async () => {
    await sql?.end();
  });

  it('normalizes exactly like normalizeText with ignoreCase false', async () => {
    const fixtures = [
      'pes',
      '  pes  ',
      'pes.',
      'pes...',
      'hello   world',
      'hello \t world',
      'Ahoj.',
      'a b  c   d',
      'jsem unavený z práce.',
    ];

    for (const fixture of fixtures) {
      const { norm_known } = await poolKey('cs', 'en', fixture, 'x');
      expect(norm_known, `SQL disagrees with normalizeText for ${JSON.stringify(fixture)}`).toBe(
        normalizeText(fixture, { ignoreCase: false }),
      );
    }
  });

  it('folds trailing dots and whitespace into one key', async () => {
    const a = await poolKey('cs', 'en', 'pes', 'dog');
    const b = await poolKey('cs', 'en', '  pes.  ', 'dog');
    const c = await poolKey('cs', 'en', 'pes..', ' dog ');
    expect(a.key).toBe(b.key);
    expect(a.key).toBe(c.key);
  });

  it('keeps case distinct, unlike the audio-equivalence rule', async () => {
    const lower = await poolKey('cs', 'en', 'pes', 'dog');
    const upper = await poolKey('cs', 'en', 'Pes', 'dog');
    expect(lower.key).not.toBe(upper.key);
  });

  it('folds language case', async () => {
    const lower = await poolKey('cs', 'en', 'pes', 'dog');
    const upper = await poolKey('CS', 'EN', 'pes', 'dog');
    expect(lower.key).toBe(upper.key);
  });

  it('agrees on NFC and NFD spellings of the same word', async () => {
    const nfc = 'unavený'.normalize('NFC');
    const nfd = 'unavený'.normalize('NFD');
    expect(nfc).not.toBe(nfd); // the fixture is only meaningful if they differ
    const a = await poolKey('cs', 'en', nfc, 'tired');
    const b = await poolKey('cs', 'en', nfd, 'tired');
    expect(a.key).toBe(b.key);
  });

  /**
   * The reason for length prefixes. With a bare '|' separator these two
   * different pairs serialize to the same string and collide.
   */
  it('cannot be forged by moving the separator between fields', async () => {
    const a = await poolKey('cs', 'en', 'ab|c', 'd');
    const b = await poolKey('cs', 'en', 'ab', 'c|d');
    expect(a.key).not.toBe(b.key);
  });

  it('separates pairs that differ only in language direction', async () => {
    const forward = await poolKey('cs', 'en', 'pes', 'dog');
    const reverse = await poolKey('en', 'cs', 'pes', 'dog');
    expect(forward.key).not.toBe(reverse.key);
  });
});
