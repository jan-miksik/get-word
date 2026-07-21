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
 * `redeemSchoolCode` runs a fixed sequence of statements inside one
 * transaction: code lookup, school lookup (FOR UPDATE), the caller's existing
 * membership, seat counts, then the insert. Feeding rows positionally keeps the
 * tests readable; `executed` records how far the sequence actually got, which
 * is how we assert that a rejection happened before the INSERT.
 */
function stubTransaction(rows: unknown[][]) {
  const executed: number[] = [];
  mockDbTransaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => {
    let step = 0;
    return run({
      execute: async () => {
        executed.push(step);
        return rows[step++] ?? [];
      },
    });
  });
  return { statementCount: () => executed.length };
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
