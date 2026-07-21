import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbTransaction = vi.fn();

vi.mock('@/lib/db/client', () => ({
  db: {
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
}));

import { SchoolRedeemError, redeemSchoolCode } from '../redeem';
import type { User } from '@/lib/db/schema';

const CODE = 'SCHOOLCODE1234';

const linkedUser = {
  id: 'user-1',
  email: 'student@example.com',
  supabaseAuthId: 'sb-1',
  authProvider: 'email',
} as User;

const deviceOnlyUser = {
  id: 'user-2',
  email: null,
  supabaseAuthId: null,
  authProvider: null,
} as unknown as User;

function schoolRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'school-1',
    name: 'Pilot',
    status: 'active',
    student_seat_limit: 30,
    teacher_limit: 5,
    pilot_expires_at: null,
    ...overrides,
  };
}

function codeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'code-1',
    school_id: 'school-1',
    role: 'student',
    expires_at: null,
    revoked_at: null,
    ...overrides,
  };
}

/**
 * Flatten a drizzle `sql` template back into something greppable. Only the
 * literal chunks matter here — the tests ask which table a statement touched,
 * never which values it bound.
 */
function statementText(query: unknown): string {
  const chunks = (query as { queryChunks?: { value?: unknown }[] })?.queryChunks ?? [];
  return chunks
    .map((chunk) => (Array.isArray(chunk?.value) ? chunk.value.join(' ') : ''))
    .join(' ');
}

/**
 * `redeemSchoolCode` runs a fixed sequence of statements inside one
 * transaction: code lookup, school lookup (FOR UPDATE), the caller's existing
 * membership, seat counts, then the insert, then anything the linked list
 * needs. Feeding rows positionally keeps the tests readable; `executed` records
 * how far the sequence actually got, which is how we assert that a rejection
 * happened before the INSERT.
 */
function stubTransaction(rows: unknown[][]) {
  const executed: string[] = [];
  mockDbTransaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => {
    let step = 0;
    return run({
      execute: async (query: unknown) => {
        executed.push(statementText(query));
        return rows[step++] ?? [];
      },
    });
  });
  return {
    statementCount: () => executed.length,
    touched: (table: string) => executed.some((text) => text.includes(table)),
  };
}

describe('redeemSchoolCode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires a linked email or Google account', async () => {
    await expect(redeemSchoolCode({ user: deviceOnlyUser, code: CODE })).rejects.toMatchObject({
      code: 'LINKED_ACCOUNT_REQUIRED',
      status: 403,
    } satisfies Partial<SchoolRedeemError>);

    expect(mockDbTransaction).not.toHaveBeenCalled();
  });

  it('rejects a malformed code without opening a transaction', async () => {
    await expect(redeemSchoolCode({ user: linkedUser, code: 'short' })).rejects.toMatchObject({
      code: 'INVALID_SCHOOL_CODE',
      status: 404,
    });

    expect(mockDbTransaction).not.toHaveBeenCalled();
  });

  it('reports an unknown code as invalid', async () => {
    stubTransaction([[]]);

    await expect(redeemSchoolCode({ user: linkedUser, code: CODE })).rejects.toMatchObject({
      code: 'INVALID_SCHOOL_CODE',
      status: 404,
    });
  });

  it('claims a student seat and reports the updated counts', async () => {
    const tx = stubTransaction([
      [codeRow()],
      [schoolRow()],
      [], // no existing membership
      [{ active_student_seats: 4, active_teachers: 1 }],
      [], // INSERT
    ]);

    const result = await redeemSchoolCode({ user: linkedUser, code: CODE });

    expect(result).toEqual({
      school_id: 'school-1',
      school_name: 'Pilot',
      role: 'student',
      student_seat_limit: 30,
      active_student_seats: 5,
      teacher_limit: 5,
      active_teachers: 1,
    });
    expect(tx.statementCount()).toBe(5);
    expect(tx.touched('user_list_subscriptions')).toBe(false);
  });

  describe('link that names a list', () => {
    const LIST_ID = '11111111-2222-4333-8444-555555555555';

    function listRow(overrides: Record<string, unknown> = {}) {
      return {
        id: LIST_ID,
        owner_id: 'teacher-9',
        is_public: false,
        language_from: 'cs',
        language_to: 'vi',
        owned_by_school_teacher: true,
        ...overrides,
      };
    }

    function joinRows(list: unknown[]) {
      return [
        [codeRow()],
        [schoolRow()],
        [], // no existing membership
        [{ active_student_seats: 0, active_teachers: 0 }],
        [], // INSERT membership
        list,
        [], // INSERT subscription
        [], // UPDATE users
      ];
    }

    it('subscribes the new member and points the study direction at the list', async () => {
      const tx = stubTransaction(joinRows([listRow()]));

      await redeemSchoolCode({ user: linkedUser, code: CODE, listId: LIST_ID });

      expect(tx.touched('user_list_subscriptions')).toBe(true);
      expect(tx.statementCount()).toBe(8);
    });

    // The list id comes from the URL, so it is chosen by whoever follows the
    // link. Subscribing bypasses the usual visibility check, so without this a
    // school code would be a key to any private list whose id leaked.
    it('ignores a private list belonging to nobody in this school', async () => {
      const tx = stubTransaction(
        joinRows([listRow({ owner_id: 'stranger-1', owned_by_school_teacher: false })]),
      );

      const result = await redeemSchoolCode({ user: linkedUser, code: CODE, listId: LIST_ID });

      expect(result.role).toBe('student');
      expect(tx.touched('user_list_subscriptions')).toBe(false);
    });

    it('accepts a public list even though no teacher here owns it', async () => {
      const tx = stubTransaction(
        joinRows([listRow({ owner_id: 'stranger-1', is_public: true, owned_by_school_teacher: false })]),
      );

      await redeemSchoolCode({ user: linkedUser, code: CODE, listId: LIST_ID });

      expect(tx.touched('user_list_subscriptions')).toBe(true);
    });

    // The list is the teacher's own. Subscribing an owner to their own list
    // would show it twice, and rewriting their study direction from a link they
    // wrote for their class is not something they asked for.
    it('leaves the list owner alone', async () => {
      const tx = stubTransaction(joinRows([listRow({ owner_id: linkedUser.id })]));

      await redeemSchoolCode({ user: linkedUser, code: CODE, listId: LIST_ID });

      expect(tx.touched('user_list_subscriptions')).toBe(false);
    });

    // A mistyped or stale link must not cost the seat, which is the part the
    // code actually grants.
    it.each([
      ['a list that no longer exists', LIST_ID, [] as unknown[]],
      ['an id that is not a uuid', 'not-a-uuid', [listRow()] as unknown[]],
    ])('still grants the seat for %s', async (_label, listId, list) => {
      const tx = stubTransaction(joinRows(list));

      const result = await redeemSchoolCode({ user: linkedUser, code: CODE, listId });

      expect(result.active_student_seats).toBe(1);
      expect(tx.touched('user_list_subscriptions')).toBe(false);
    });
  });

  it('refuses a student seat when the school is full', async () => {
    const tx = stubTransaction([
      [codeRow()],
      [schoolRow({ student_seat_limit: 30 })],
      [],
      [{ active_student_seats: 30, active_teachers: 0 }],
    ]);

    await expect(redeemSchoolCode({ user: linkedUser, code: CODE })).rejects.toMatchObject({
      code: 'SCHOOL_SEATS_FULL',
      status: 409,
    });

    // Stopped at the seat count — no INSERT ran.
    expect(tx.statementCount()).toBe(4);
  });

  it('counts teacher seats against the teacher limit', async () => {
    stubTransaction([
      [codeRow({ role: 'teacher' })],
      [schoolRow({ teacher_limit: 5 })],
      [],
      [{ active_student_seats: 0, active_teachers: 5 }],
    ]);

    await expect(redeemSchoolCode({ user: linkedUser, code: CODE })).rejects.toMatchObject({
      code: 'SCHOOL_TEACHERS_FULL',
      status: 409,
    });
  });

  it('refuses an expired code', async () => {
    stubTransaction([
      [codeRow({ expires_at: new Date('2020-01-01T00:00:00Z') })],
      [schoolRow()],
      [],
    ]);

    await expect(redeemSchoolCode({ user: linkedUser, code: CODE })).rejects.toMatchObject({
      code: 'SCHOOL_CODE_EXPIRED',
      status: 410,
    });
  });

  it('reports a revoked code as invalid rather than revoked', async () => {
    stubTransaction([
      [codeRow({ revoked_at: new Date('2026-01-01T00:00:00Z') })],
      [schoolRow()],
      [],
    ]);

    await expect(redeemSchoolCode({ user: linkedUser, code: CODE })).rejects.toMatchObject({
      code: 'INVALID_SCHOOL_CODE',
      status: 404,
    });
  });

  it('refuses a code for a second school while a membership is active', async () => {
    const tx = stubTransaction([
      [codeRow({ school_id: 'school-2' })],
      [schoolRow({ id: 'school-2', name: 'Other' })],
      [{ school_id: 'school-1', role: 'student' }],
    ]);

    await expect(redeemSchoolCode({ user: linkedUser, code: CODE })).rejects.toMatchObject({
      code: 'SCHOOL_MEMBERSHIP_ALREADY_EXISTS',
      status: 409,
    });

    expect(tx.statementCount()).toBe(3);
  });

  it('is idempotent for a member of the same school, keeping their existing role', async () => {
    const tx = stubTransaction([
      // Deliberately revoked and expired: re-opening the link must not evict a
      // student who already holds a seat.
      [codeRow({ role: 'student', revoked_at: new Date('2026-01-01T00:00:00Z') })],
      [schoolRow()],
      [{ school_id: 'school-1', role: 'teacher' }],
      [{ active_student_seats: 3, active_teachers: 2 }],
    ]);

    const result = await redeemSchoolCode({ user: linkedUser, code: CODE });

    expect(result.role).toBe('teacher');
    expect(result.active_student_seats).toBe(3);
    // No second INSERT for an existing member.
    expect(tx.statementCount()).toBe(4);
  });

  it('reports an inactive school before it reports a bad code', async () => {
    stubTransaction([
      [codeRow({ revoked_at: new Date('2026-01-01T00:00:00Z') })],
      [schoolRow({ status: 'inactive' })],
      [],
    ]);

    // Ordering is deliberate: "this school is switched off" is more actionable
    // for a teacher than "invalid code".
    await expect(redeemSchoolCode({ user: linkedUser, code: CODE })).rejects.toMatchObject({
      code: 'SCHOOL_INACTIVE',
      status: 403,
    });
  });

  it('refuses a school whose pilot window has closed', async () => {
    stubTransaction([
      [codeRow()],
      [schoolRow({ pilot_expires_at: new Date('2020-01-01T00:00:00Z') })],
      [],
    ]);

    await expect(redeemSchoolCode({ user: linkedUser, code: CODE })).rejects.toMatchObject({
      code: 'SCHOOL_PILOT_EXPIRED',
      status: 403,
    });
  });
});
