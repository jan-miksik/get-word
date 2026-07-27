import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/**
 * Guards the leak that would expose one learner's personal word-chat list to
 * every other user: `getUserLists` and `getUserListsByLanguagePair` both return
 * rows purely for being `is_public = true`, so the personal exclusion has to be
 * part of that clause.
 *
 * The queries are asserted at the SQL level because that is where the bug would
 * live — a missing `and(...)` in the public branch, not in any pure helper.
 */
const captured: { where: SQL | undefined }[] = [];

function queryStub() {
  const builder = {
    from: () => builder,
    where: (condition: SQL) => {
      captured.push({ where: condition });
      return builder;
    },
    then: (resolve: (value: unknown[]) => unknown) => resolve([]),
  };
  return builder;
}

vi.mock('../../../client', () => ({
  db: {
    select: () => queryStub(),
  },
}));

import { getUserLists, getUserListsByLanguagePair } from '../lists';

function renderLastWhere(): string {
  const last = captured[captured.length - 1];
  expect(last?.where).toBeDefined();
  return new PgDialect().sqlToQuery(last.where as SQL).sql;
}

describe('personal lists are excluded from the "all public lists" branch', () => {
  it('getUserLists never returns someone else\'s personal list just for being public', async () => {
    await getUserLists('user-1');
    const sql = renderLastWhere();

    expect(sql).toContain('"is_public"');
    expect(sql).toContain('"is_personal"');
    // The exclusion must sit next to the public check, not replace the owner or
    // subscription branches — the owner and deliberate subscribers still see it.
    expect(sql).toMatch(/"is_public"\s*=\s*\$\d+\s+and\s+"word_lists"\."is_personal"/i);
    expect(sql).toContain('"owner_id"');
  });

  it('getUserListsByLanguagePair applies the same rule to onboarding matches', async () => {
    await getUserListsByLanguagePair('user-1', 'cs', 'vi');
    const sql = renderLastWhere();

    expect(sql).toContain('"is_personal"');
    expect(sql).toMatch(/"is_public"\s*=\s*\$\d+\s+and\s+"word_lists"\."is_personal"/i);
  });
});
