import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import type { User } from '@/lib/db/schema';
import type {
  SchoolBenefitLimits,
  SchoolEntitlement,
  SchoolFeature,
  SchoolPlan,
  SchoolRole,
} from '@/features/schools/types';
import { SCHOOL_PLAN_LIMITS } from './config';
import { getUtcPeriodWindow } from './period';

export function isSchoolLinkedAccountUser(user: User): boolean {
  return Boolean(
    user.supabaseAuthId &&
      user.email &&
      (user.authProvider === 'email' || user.authProvider === 'google'),
  );
}

function getSchoolLimits(plan: SchoolPlan, role: SchoolRole): SchoolBenefitLimits {
  return SCHOOL_PLAN_LIMITS[plan]?.[role] ?? SCHOOL_PLAN_LIMITS.pilot_v1.student;
}

type EntitlementRow = {
  school_id: string;
  school_name: string;
  plan: SchoolPlan;
  role: SchoolRole;
};

export async function getActiveSchoolEntitlement(
  userId: string,
): Promise<SchoolEntitlement | null> {
  const rows = await db.execute(sql`
    SELECT
      s.id AS school_id,
      s.name AS school_name,
      s.plan,
      m.role
    FROM school_memberships m
    JOIN schools s ON s.id = m.school_id
    WHERE m.user_id = ${userId}
      AND m.revoked_at IS NULL
      AND s.status = 'active'
      AND (s.pilot_expires_at IS NULL OR s.pilot_expires_at > now())
    -- A partial unique index allows only one active membership per user, so
    -- this normally matches a single row. The ordering is insurance: should a
    -- second one ever appear (manual fix, future multi-school support), the
    -- newest membership wins deterministically instead of the row order
    -- flipping between requests and billing two schools at random.
    ORDER BY m.claimed_at DESC, m.id DESC
    LIMIT 1
  `);
  const row = rows[0] as EntitlementRow | undefined;
  if (!row) return null;
  return {
    schoolId: row.school_id,
    schoolName: row.school_name,
    plan: row.plan,
    role: row.role,
    limits: getSchoolLimits(row.plan, row.role),
  };
}

export function getCurrentSchoolFeaturePeriod(date = new Date()) {
  return getUtcPeriodWindow('month', date);
}

export async function getSchoolFeatureUsage(input: {
  userId: string;
  feature: SchoolFeature;
  date?: Date;
}) {
  const { start, resetAt } = getCurrentSchoolFeaturePeriod(input.date);
  const rows = await db.execute(sql`
    SELECT used
    FROM school_feature_usage
    WHERE user_id = ${input.userId}
      AND feature = ${input.feature}
      AND period_start = ${start.toISOString()}::timestamp
    LIMIT 1
  `);
  const used = Number((rows[0] as { used?: unknown } | undefined)?.used ?? 0);
  return {
    used: Number.isFinite(used) ? used : 0,
    resetAt,
    periodStart: start,
  };
}
