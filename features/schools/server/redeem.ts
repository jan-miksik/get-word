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

export async function redeemSchoolCode(input: {
  user: User;
  code: string;
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

    return serialize(school, code.role, {
      active_student_seats: counts.active_student_seats + (code.role === 'student' ? 1 : 0),
      active_teachers: counts.active_teachers + (code.role === 'teacher' ? 1 : 0),
    });
  });
}
