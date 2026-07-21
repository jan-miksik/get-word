import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import type { User } from '@/lib/db/schema';
import type { SchoolRole } from '@/features/schools/types';
import { assertUsableSchoolCode, hashSchoolCode } from './code';
import { isSchoolLinkedAccountUser } from './entitlements';

export type SchoolRedeemSuccess = {
  school_id: string;
  school_name: string;
  role: SchoolRole;
  student_seat_limit: number;
  active_student_seats: number;
  teacher_limit: number;
  active_teachers: number;
};

export type SchoolRedeemErrorCode =
  | 'AUTH_REQUIRED'
  | 'LINKED_ACCOUNT_REQUIRED'
  | 'INVALID_SCHOOL_CODE'
  | 'SCHOOL_CODE_EXPIRED'
  | 'SCHOOL_INACTIVE'
  | 'SCHOOL_PILOT_EXPIRED'
  | 'SCHOOL_SEATS_FULL'
  | 'SCHOOL_TEACHERS_FULL'
  | 'SCHOOL_MEMBERSHIP_ALREADY_EXISTS';

export class SchoolRedeemError extends Error {
  constructor(
    readonly code: SchoolRedeemErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SchoolRedeemError';
  }
}

type CodeRow = {
  id: string;
  school_id: string;
  role: SchoolRole;
  expires_at: Date | null;
  revoked_at: Date | null;
};

type SchoolRow = {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  student_seat_limit: number;
  teacher_limit: number;
  pilot_expires_at: Date | null;
};

type MembershipRow = {
  school_id: string;
  role: SchoolRole;
};

type CountRow = {
  active_student_seats: number;
  active_teachers: number;
};

function nowPast(date: Date | null, now: Date) {
  return Boolean(date && date <= now);
}

function schoolInactiveError(school: SchoolRow, now: Date): SchoolRedeemError | null {
  if (school.status !== 'active') {
    return new SchoolRedeemError('SCHOOL_INACTIVE', 403, 'This school is not active.');
  }
  if (nowPast(school.pilot_expires_at, now)) {
    return new SchoolRedeemError('SCHOOL_PILOT_EXPIRED', 403, 'This school pilot has expired.');
  }
  return null;
}

function serialize(
  school: SchoolRow,
  role: SchoolRole,
  counts: CountRow,
): SchoolRedeemSuccess {
  return {
    school_id: school.id,
    school_name: school.name,
    role,
    student_seat_limit: Number(school.student_seat_limit),
    active_student_seats: Number(counts.active_student_seats),
    teacher_limit: Number(school.teacher_limit),
    active_teachers: Number(counts.active_teachers),
  };
}

/**
 * Put the redeemer into the list the link named, if it named one.
 *
 * The list id travels in the link rather than on the code, so one class code
 * can be handed out as several links, one per class — but it also means the
 * value is attacker-chosen, and subscribing bypasses the public/owner check
 * that the ordinary subscribe route enforces (a class list is normally
 * private, which is the whole reason this path exists). What keeps that from
 * becoming "anyone holding a school code can read any private list" is the
 * check below: the list must be public, or belong to a teacher of the very
 * school being joined. Knowing a list id is then not enough.
 *
 * Study direction follows the list, because a student arriving from a school
 * link has no other way to pick one and a mismatched pair renders the list
 * unreadable.
 *
 * Everything that does not line up — list deleted between sending the link and
 * following it, redeemer owns it already, id that points somewhere they have no
 * business seeing — is a silent no-op. They still get the seat, which is what
 * the code actually grants; failing the redeem over the extra would turn a
 * mistyped link into a lost student.
 */
async function applyLinkedList(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  schoolId: string,
  listId: string,
): Promise<void> {
  const listRows = await tx.execute(sql`
    SELECT
      l.id,
      l.owner_id,
      l.is_public,
      l.language_from,
      l.language_to,
      EXISTS (
        SELECT 1
        FROM school_memberships m
        WHERE m.user_id = l.owner_id
          AND m.school_id = ${schoolId}
          AND m.role = 'teacher'
          AND m.revoked_at IS NULL
      ) AS owned_by_school_teacher
    FROM word_lists l
    WHERE l.id = ${listId}
    LIMIT 1
  `);
  const list = listRows[0] as
    | {
        id: string;
        owner_id: string | null;
        is_public: boolean;
        language_from: string;
        language_to: string;
        owned_by_school_teacher: boolean;
      }
    | undefined;
  if (!list || list.owner_id === userId) return;
  if (!list.is_public && !list.owned_by_school_teacher) return;

  await tx.execute(sql`
    INSERT INTO user_list_subscriptions (user_id, list_id)
    VALUES (${userId}, ${listId})
    ON CONFLICT DO NOTHING
  `);

  await tx.execute(sql`
    UPDATE users
    SET language_from = ${list.language_from},
        language_to = ${list.language_to},
        onboarding_completed_at = coalesce(onboarding_completed_at, now()),
        updated_at = now()
    WHERE id = ${userId}
  `);
}

async function countActiveSeats(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  schoolId: string,
): Promise<CountRow> {
  const rows = await tx.execute(sql`
    SELECT
      count(*) FILTER (WHERE role = 'student')::int AS active_student_seats,
      count(*) FILTER (WHERE role = 'teacher')::int AS active_teachers
    FROM school_memberships
    WHERE school_id = ${schoolId}
      AND revoked_at IS NULL
  `);
  const row = rows[0] as CountRow | undefined;
  return {
    active_student_seats: Number(row?.active_student_seats ?? 0),
    active_teachers: Number(row?.active_teachers ?? 0),
  };
}

const LIST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function redeemSchoolCode(input: {
  user: User;
  code: string;
  /**
   * Optional list from the link. Junk is dropped rather than rejected — the
   * seat must not depend on the decoration.
   */
  listId?: string | null;
}): Promise<SchoolRedeemSuccess> {
  if (!isSchoolLinkedAccountUser(input.user)) {
    throw new SchoolRedeemError(
      'LINKED_ACCOUNT_REQUIRED',
      403,
      'Sign in with email or Google before using a school code.',
    );
  }
  const normalized = assertUsableSchoolCode(input.code);
  if (!normalized) {
    throw new SchoolRedeemError('INVALID_SCHOOL_CODE', 404, 'Invalid school code.');
  }
  const codeHash = hashSchoolCode(normalized);
  const linkedListId =
    typeof input.listId === 'string' && LIST_ID_PATTERN.test(input.listId.trim())
      ? input.listId.trim()
      : null;
  const now = new Date();

  return db.transaction(async (tx) => {
    const codeRows = await tx.execute(sql`
      SELECT id, school_id, role, expires_at, revoked_at
      FROM school_access_codes
      WHERE code_hash = ${codeHash}
      LIMIT 1
    `);
    const code = codeRows[0] as CodeRow | undefined;
    if (!code) {
      throw new SchoolRedeemError('INVALID_SCHOOL_CODE', 404, 'Invalid school code.');
    }

    const schoolRows = await tx.execute(sql`
      SELECT id, name, status, student_seat_limit, teacher_limit, pilot_expires_at
      FROM schools
      WHERE id = ${code.school_id}
      FOR UPDATE
    `);
    const school = schoolRows[0] as SchoolRow | undefined;
    if (!school) {
      throw new SchoolRedeemError('INVALID_SCHOOL_CODE', 404, 'Invalid school code.');
    }

    const membershipRows = await tx.execute(sql`
      SELECT school_id, role
      FROM school_memberships
      WHERE user_id = ${input.user.id}
        AND revoked_at IS NULL
      LIMIT 1
    `);
    const existing = membershipRows[0] as MembershipRow | undefined;

    if (existing) {
      if (existing.school_id !== school.id) {
        throw new SchoolRedeemError(
          'SCHOOL_MEMBERSHIP_ALREADY_EXISTS',
          409,
          'This account already has an active school membership.',
        );
      }
      const inactive = schoolInactiveError(school, now);
      if (inactive) throw inactive;
      return serialize(school, existing.role, await countActiveSeats(tx, school.id));
    }

    const inactive = schoolInactiveError(school, now);
    if (inactive) throw inactive;
    if (code.revoked_at) {
      throw new SchoolRedeemError('INVALID_SCHOOL_CODE', 404, 'Invalid school code.');
    }
    if (nowPast(code.expires_at, now)) {
      throw new SchoolRedeemError('SCHOOL_CODE_EXPIRED', 410, 'This school code has expired.');
    }

    const counts = await countActiveSeats(tx, school.id);
    if (code.role === 'student' && counts.active_student_seats >= school.student_seat_limit) {
      throw new SchoolRedeemError('SCHOOL_SEATS_FULL', 409, 'This school has no student seats left.');
    }
    if (code.role === 'teacher' && counts.active_teachers >= school.teacher_limit) {
      throw new SchoolRedeemError('SCHOOL_TEACHERS_FULL', 409, 'This school has no teacher seats left.');
    }

    await tx.execute(sql`
      INSERT INTO school_memberships (
        school_id,
        user_id,
        role,
        claimed_at,
        created_at,
        updated_at
      )
      VALUES (${school.id}, ${input.user.id}, ${code.role}, now(), now(), now())
    `);

    if (linkedListId) {
      await applyLinkedList(tx, input.user.id, school.id, linkedListId);
    }

    return serialize(school, code.role, {
      active_student_seats: counts.active_student_seats + (code.role === 'student' ? 1 : 0),
      active_teachers: counts.active_teachers + (code.role === 'teacher' ? 1 : 0),
    });
  });
}
