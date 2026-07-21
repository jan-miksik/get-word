import { sql, type SQL } from 'drizzle-orm';
import type { ActivityWindow, StudyWeekBucket, UsageWeekBucket } from '@/lib/stats/types';
import type {
  SchoolMemberUsageRow,
  SchoolPlan,
  SchoolRole,
  SchoolSummary,
  SchoolUsageStats,
} from '@/features/schools/types';
import { SCHOOL_PLAN_LIMITS } from '@/features/schools/server/config';
import { getUtcPeriodWindow } from '@/features/schools/server/period';
import { db } from '../client';
import {
  TREND_WEEKS,
  WEEK_MS,
  firstRow,
  getActivityWindowStarts,
  getUtcMonday,
  normalizeActivityWindow,
  numberFromRow,
  toDateString,
  weekStarts,
  zeroFillWeeks,
} from './stats-shared';

/**
 * Per-school usage statistics for `/school/overview` (teachers) and
 * `/admin/schools/[id]` (editors).
 *
 * Three kinds of metric with three different filters — mixing them up is the
 * main way this query goes wrong:
 *
 * 1. Current state (seats, member rows, who is at their limit) — active
 *    memberships only.
 * 2. Historical events (reviews, joins, lists created) — the event must fall
 *    inside a membership interval, via EXISTS so repeated memberships never
 *    multiply rows. Activity before joining does not count towards the school,
 *    and revoking a membership does not erase the school's past.
 * 3. Usage billed to the school — filtered by `school_id` on the usage rows
 *    themselves, never through current membership: a member who has since left
 *    still cost the school their quota.
 *
 * Known limitation: `school_feature_usage` is unique on
 * (user_id, feature, period_start) because the quota is per user per month and
 * a transfer must not reset it. A member who transfers mid-month therefore has
 * that whole month attributed to their latest school.
 *
 * Member rows are pseudonymized (ordinal, day-granularity dates) and assembled
 * from an explicit field whitelist — never by spreading a database row.
 */

type SchoolRow = {
  id: string;
  name: string;
  plan: SchoolPlan;
  status: 'active' | 'inactive';
  pilot_expires_at: Date | null;
  student_seat_limit: number;
  teacher_limit: number;
  active_students: number;
  active_teachers: number;
};

/** Events by members of this school, restricted to their membership intervals. */
function withinMembership(userColumn: SQL, timeColumn: SQL, schoolId: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM school_memberships m
    WHERE m.school_id = ${schoolId}
      AND m.user_id = ${userColumn}
      AND ${timeColumn} >= m.claimed_at
      AND (m.revoked_at IS NULL OR ${timeColumn} < m.revoked_at)
  )`;
}

function toDayString(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : toDateString(date);
}

async function getSchoolAndSeats(schoolId: string): Promise<SchoolRow | null> {
  const rows = await db.execute(sql`
    SELECT
      s.id::text AS id,
      s.name AS name,
      s.plan AS plan,
      s.status AS status,
      s.pilot_expires_at AS pilot_expires_at,
      s.student_seat_limit AS student_seat_limit,
      s.teacher_limit AS teacher_limit,
      count(m.id) FILTER (WHERE m.revoked_at IS NULL AND m.role = 'student')::int AS active_students,
      count(m.id) FILTER (WHERE m.revoked_at IS NULL AND m.role = 'teacher')::int AS active_teachers
    FROM schools s
    LEFT JOIN school_memberships m ON m.school_id = s.id
    WHERE s.id = ${schoolId}
    GROUP BY s.id
  `);
  return (rows[0] as SchoolRow | undefined) ?? null;
}

async function getJoinedWeekly(
  schoolId: string,
  starts: string[],
  windowFrom: string,
  windowTo: string,
): Promise<UsageWeekBucket[]> {
  const rows = await db.execute(sql`
    SELECT date_trunc('week', m.claimed_at)::date::text AS week_start,
           count(*)::int AS joined
    FROM school_memberships m
    WHERE m.school_id = ${schoolId}
      AND m.claimed_at >= ${windowFrom}::timestamp
      AND m.claimed_at < ${windowTo}::timestamp
    GROUP BY 1
    ORDER BY 1
  `);
  const byWeek = new Map<string, { count: number }>();
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    byWeek.set(String(row.week_start ?? ''), { count: numberFromRow(row, 'joined') });
  }
  return zeroFillWeeks<UsageWeekBucket>(starts, byWeek, { count: 0 });
}

/**
 * App opens by current members, clamped to `claimed_at`: a member who used the
 * app for months before joining must not backfill the school's activity.
 */
async function getActivity(schoolId: string, window: ActivityWindow, now: Date) {
  const starts = getActivityWindowStarts(window, now);
  const rows = await db.execute(sql`
    SELECT
      count(DISTINCT m.user_id) FILTER (WHERE ud.last_seen_at >= ${starts.day.toISOString()}::timestamp)::int AS dau,
      count(DISTINCT m.user_id) FILTER (WHERE ud.last_seen_at >= ${starts.week.toISOString()}::timestamp)::int AS wau,
      count(DISTINCT m.user_id) FILTER (WHERE ud.last_seen_at >= ${starts.month.toISOString()}::timestamp)::int AS mau
    FROM school_memberships m
    JOIN user_devices ud
      ON ud.user_id = m.user_id
     AND ud.last_seen_at >= m.claimed_at
    WHERE m.school_id = ${schoolId}
      AND m.revoked_at IS NULL
  `);
  const row = firstRow(rows);
  return {
    window,
    dau: numberFromRow(row, 'dau'),
    wau: numberFromRow(row, 'wau'),
    mau: numberFromRow(row, 'mau'),
  };
}

async function getStudy30d(schoolId: string, monthAgo: string) {
  const rows = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE re.action = 'known')::int AS known_30d,
      count(*) FILTER (WHERE re.action = 'really_known')::int AS really_known_30d,
      count(*) FILTER (WHERE re.action = 'unknown')::int AS unknown_30d,
      count(DISTINCT re.user_id)::int AS studying_members_30d
    FROM review_events re
    WHERE re.server_created_at >= ${monthAgo}::timestamp
      AND ${withinMembership(sql`re.user_id`, sql`re.server_created_at`, schoolId)}
  `);
  const row = firstRow(rows);
  return {
    known30d: numberFromRow(row, 'known_30d'),
    reallyKnown30d: numberFromRow(row, 'really_known_30d'),
    unknown30d: numberFromRow(row, 'unknown_30d'),
    studyingMembers30d: numberFromRow(row, 'studying_members_30d'),
  };
}

async function getStudyWeekly(
  schoolId: string,
  starts: string[],
  windowFrom: string,
  windowTo: string,
): Promise<StudyWeekBucket[]> {
  const rows = await db.execute(sql`
    SELECT date_trunc('week', re.server_created_at)::date::text AS week_start,
           count(*)::int AS reviews,
           count(DISTINCT re.user_id)::int AS active_users
    FROM review_events re
    WHERE re.server_created_at >= ${windowFrom}::timestamp
      AND re.server_created_at < ${windowTo}::timestamp
      AND ${withinMembership(sql`re.user_id`, sql`re.server_created_at`, schoolId)}
    GROUP BY 1
    ORDER BY 1
  `);
  const byWeek = new Map<string, { reviews: number; activeUsers: number }>();
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    byWeek.set(String(row.week_start ?? ''), {
      reviews: numberFromRow(row, 'reviews'),
      activeUsers: numberFromRow(row, 'active_users'),
    });
  }
  return zeroFillWeeks<StudyWeekBucket>(starts, byWeek, { reviews: 0, activeUsers: 0 });
}

/** Billed to the school: filtered by `school_id`, not by current membership. */
async function getAiUsage(schoolId: string, periodStart: string) {
  const rows = await db.execute(sql`
    SELECT
      coalesce(sum(used) FILTER (WHERE feature = 'ai_translation'), 0)::int AS translation_items_used,
      coalesce(sum(used) FILTER (WHERE feature = 'photo_lab'), 0)::int AS photo_lab_used
    FROM school_feature_usage
    WHERE school_id = ${schoolId}
      AND period_start = ${periodStart}::timestamp
  `);
  const row = firstRow(rows);
  return {
    translationItemsUsed: numberFromRow(row, 'translation_items_used'),
    photoLabUsed: numberFromRow(row, 'photo_lab_used'),
  };
}

/**
 * `released` requests gave their quota back; `unknown` and `failed_charged`
 * kept it, so they count as charged failures. `reserved` is still in flight.
 */
async function getTranslationRequests(schoolId: string, periodStart: string) {
  const rows = await db.execute(sql`
    SELECT
      count(*)::int AS requests,
      count(*) FILTER (WHERE status = 'completed')::int AS completed,
      count(*) FILTER (WHERE status IN ('failed_charged', 'unknown'))::int AS failed,
      count(*) FILTER (WHERE status = 'released')::int AS released,
      count(*) FILTER (WHERE status = 'reserved')::int AS in_flight,
      coalesce(sum(character_count) FILTER (
        WHERE status IN ('completed', 'failed_charged', 'unknown')
      ), 0)::int AS characters_charged,
      coalesce(sum(character_count) FILTER (WHERE status = 'reserved'), 0)::int AS characters_reserved
    FROM school_translation_requests
    WHERE school_id = ${schoolId}
      AND period_start = ${periodStart}::timestamp
  `);
  const row = firstRow(rows);
  return {
    requests: numberFromRow(row, 'requests'),
    completed: numberFromRow(row, 'completed'),
    failed: numberFromRow(row, 'failed'),
    released: numberFromRow(row, 'released'),
    inFlight: numberFromRow(row, 'in_flight'),
    charactersCharged: numberFromRow(row, 'characters_charged'),
    charactersReserved: numberFromRow(row, 'characters_reserved'),
  };
}

/**
 * Current members who have exhausted their own role's allowance. Different
 * scope from the billed totals above, hence a separate query.
 */
async function getMembersAtLimit(schoolId: string, plan: SchoolPlan, periodStart: string) {
  const limits = SCHOOL_PLAN_LIMITS[plan] ?? SCHOOL_PLAN_LIMITS.pilot_v1;
  const rows = await db.execute(sql`
    SELECT
      m.role AS role,
      coalesce(sum(u.used) FILTER (WHERE u.feature = 'ai_translation'), 0)::int AS translation_used,
      coalesce(sum(u.used) FILTER (WHERE u.feature = 'photo_lab'), 0)::int AS photo_lab_used
    FROM school_memberships m
    LEFT JOIN school_feature_usage u
      ON u.user_id = m.user_id
     AND u.period_start = ${periodStart}::timestamp
    WHERE m.school_id = ${schoolId}
      AND m.revoked_at IS NULL
    GROUP BY m.id, m.role
  `);

  let translationAtLimit = 0;
  let photoLabAtLimit = 0;
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const role: SchoolRole = row.role === 'teacher' ? 'teacher' : 'student';
    const roleLimits = limits[role];
    if (numberFromRow(row, 'translation_used') >= roleLimits.translationItemsMonthlyLimit) {
      translationAtLimit += 1;
    }
    if (numberFromRow(row, 'photo_lab_used') >= roleLimits.photoLabMonthlyLimit) {
      photoLabAtLimit += 1;
    }
  }
  return { translationAtLimit, photoLabAtLimit };
}

/**
 * "School content" means lists a teacher created while they were a teacher of
 * this school — owning a list is not the same as it being school material.
 * Private lists are counted but never named, so a teacher's personal content
 * (and any student's) stays out of the visible table.
 */
async function getContent(schoolId: string) {
  const teacherListCondition = sql`EXISTS (
    SELECT 1 FROM school_memberships m
    WHERE m.school_id = ${schoolId}
      AND m.user_id = wl.owner_id
      AND m.role = 'teacher'
      AND wl.created_at >= m.claimed_at
      AND (m.revoked_at IS NULL OR wl.created_at < m.revoked_at)
  )`;

  const totals = await db.execute(sql`
    SELECT
      (
        SELECT count(*)::int FROM word_lists wl WHERE ${teacherListCondition}
      ) AS teacher_lists_created,
      (
        SELECT count(*)::int FROM word_lists wl WHERE ${teacherListCondition} AND wl.is_public
      ) AS public_teacher_lists,
      (
        SELECT count(*)::int
        FROM user_list_subscriptions s
        JOIN school_memberships m
          ON m.user_id = s.user_id
         AND m.school_id = ${schoolId}
         AND m.revoked_at IS NULL
      ) AS member_subscriptions
  `);

  const topRows = await db.execute(sql`
    SELECT wl.id::text AS id,
           wl.name AS name,
           wl.language_from AS language_from,
           wl.language_to AS language_to,
           count(s.id)::int AS school_subscriber_count
    FROM word_lists wl
    JOIN user_list_subscriptions s ON s.list_id = wl.id
    JOIN school_memberships m
      ON m.user_id = s.user_id
     AND m.school_id = ${schoolId}
     AND m.revoked_at IS NULL
    WHERE wl.is_public
      AND ${teacherListCondition}
    GROUP BY wl.id, wl.name, wl.language_from, wl.language_to
    ORDER BY school_subscriber_count DESC, wl.name ASC
    LIMIT 10
  `);

  const row = firstRow(totals);
  return {
    teacherListsCreated: numberFromRow(row, 'teacher_lists_created'),
    publicTeacherLists: numberFromRow(row, 'public_teacher_lists'),
    memberSubscriptions: numberFromRow(row, 'member_subscriptions'),
    topPublicTeacherLists: topRows.map((raw) => {
      const listRow = raw as Record<string, unknown>;
      return {
        id: String(listRow.id ?? ''),
        name: String(listRow.name ?? ''),
        languageFrom: String(listRow.language_from ?? ''),
        languageTo: String(listRow.language_to ?? ''),
        schoolSubscriberCount: numberFromRow(listRow, 'school_subscriber_count'),
      };
    }),
  };
}

/**
 * One row per current member. Every per-member number is aggregated in its own
 * scalar subquery: joining review events and usage rows directly would multiply
 * the row set and inflate the counts.
 */
async function getMembers(
  schoolId: string,
  monthAgo: string,
  periodStart: string,
): Promise<SchoolMemberUsageRow[]> {
  const rows = await db.execute(sql`
    SELECT
      m.role AS role,
      m.claimed_at AS claimed_at,
      (
        SELECT max(ud.last_seen_at)
        FROM user_devices ud
        WHERE ud.user_id = m.user_id
          AND ud.last_seen_at >= m.claimed_at
      ) AS last_seen_at,
      (
        SELECT count(*)::int
        FROM review_events re
        WHERE re.user_id = m.user_id
          AND re.server_created_at >= ${monthAgo}::timestamp
          AND re.server_created_at >= m.claimed_at
      ) AS reviews_30d,
      (
        SELECT coalesce(sum(u.used), 0)::int
        FROM school_feature_usage u
        WHERE u.user_id = m.user_id
          AND u.feature = 'ai_translation'
          AND u.period_start = ${periodStart}::timestamp
      ) AS translation_items_used,
      (
        SELECT coalesce(sum(u.used), 0)::int
        FROM school_feature_usage u
        WHERE u.user_id = m.user_id
          AND u.feature = 'photo_lab'
          AND u.period_start = ${periodStart}::timestamp
      ) AS photo_lab_used
    FROM school_memberships m
    WHERE m.school_id = ${schoolId}
      AND m.revoked_at IS NULL
    ORDER BY m.role ASC, m.claimed_at ASC, m.id ASC
  `);

  const ordinalByRole = new Map<SchoolRole, number>();
  return rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const role: SchoolRole = row.role === 'teacher' ? 'teacher' : 'student';
    const ordinal = (ordinalByRole.get(role) ?? 0) + 1;
    ordinalByRole.set(role, ordinal);
    return {
      ordinal,
      role,
      joinedOn: toDayString(row.claimed_at) ?? '',
      lastActiveOn: toDayString(row.last_seen_at),
      reviews30d: numberFromRow(row, 'reviews_30d'),
      translationItemsUsed: numberFromRow(row, 'translation_items_used'),
      photoLabUsed: numberFromRow(row, 'photo_lab_used'),
    };
  });
}

/** Schools with their current seat usage, for the editor-facing picker. */
export async function listSchoolSummaries(): Promise<SchoolSummary[]> {
  const rows = await db.execute(sql`
    SELECT
      s.id::text AS id,
      s.name AS name,
      s.plan AS plan,
      s.status AS status,
      s.pilot_expires_at AS pilot_expires_at,
      count(m.id) FILTER (WHERE m.revoked_at IS NULL AND m.role = 'student')::int AS active_students,
      count(m.id) FILTER (WHERE m.revoked_at IS NULL AND m.role = 'teacher')::int AS active_teachers
    FROM schools s
    LEFT JOIN school_memberships m ON m.school_id = s.id
    GROUP BY s.id
    ORDER BY s.name ASC
  `);
  return rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      id: String(row.id ?? ''),
      name: String(row.name ?? ''),
      plan: String(row.plan ?? 'pilot_v1') as SchoolPlan,
      status: row.status === 'inactive' ? 'inactive' : 'active',
      pilotExpiresAt: row.pilot_expires_at ? new Date(String(row.pilot_expires_at)).toISOString() : null,
      activeStudents: numberFromRow(row, 'active_students'),
      activeTeachers: numberFromRow(row, 'active_teachers'),
    };
  });
}

export async function getSchoolUsageStats(
  schoolId: string,
  options: { activityWindow?: ActivityWindow } = {},
): Promise<SchoolUsageStats | null> {
  const generatedAt = new Date();
  const activityWindow = normalizeActivityWindow(options.activityWindow);

  const school = await getSchoolAndSeats(schoolId);
  if (!school) return null;

  const monthAgo = new Date(generatedAt.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const currentWeekStart = getUtcMonday(generatedAt);
  const windowFrom = new Date(currentWeekStart.getTime() - (TREND_WEEKS - 1) * WEEK_MS).toISOString();
  const windowTo = new Date(currentWeekStart.getTime() + WEEK_MS).toISOString();
  const starts = weekStarts(currentWeekStart);
  const period = getUtcPeriodWindow('month', generatedAt);
  const periodStart = period.start.toISOString();
  const planLimits = SCHOOL_PLAN_LIMITS[school.plan] ?? SCHOOL_PLAN_LIMITS.pilot_v1;

  const [joinedWeekly, activity, study30d, studyWeekly, aiUsage, translationRequests, atLimit, content, members] =
    await Promise.all([
      getJoinedWeekly(schoolId, starts, windowFrom, windowTo),
      getActivity(schoolId, activityWindow, generatedAt),
      getStudy30d(schoolId, monthAgo),
      getStudyWeekly(schoolId, starts, windowFrom, windowTo),
      getAiUsage(schoolId, periodStart),
      getTranslationRequests(schoolId, periodStart),
      getMembersAtLimit(schoolId, school.plan, periodStart),
      getContent(schoolId),
      getMembers(schoolId, monthAgo, periodStart),
    ]);

  return {
    generatedAt: generatedAt.toISOString(),
    school: {
      id: school.id,
      name: school.name,
      plan: school.plan,
      status: school.status,
      pilotExpiresAt: school.pilot_expires_at
        ? new Date(school.pilot_expires_at).toISOString()
        : null,
    },
    seats: {
      studentLimit: Number(school.student_seat_limit ?? 0),
      activeStudents: Number(school.active_students ?? 0),
      teacherLimit: Number(school.teacher_limit ?? 0),
      activeTeachers: Number(school.active_teachers ?? 0),
    },
    membership: { joinedWeekly },
    activity,
    study: { ...study30d, weekly: studyWeekly },
    ai: {
      periodStart,
      resetAt: period.resetAt.toISOString(),
      limits: {
        student: {
          translationItemsMonthly: planLimits.student.translationItemsMonthlyLimit,
          photoLabMonthly: planLimits.student.photoLabMonthlyLimit,
        },
        teacher: {
          translationItemsMonthly: planLimits.teacher.translationItemsMonthlyLimit,
          photoLabMonthly: planLimits.teacher.photoLabMonthlyLimit,
        },
      },
      translation: {
        itemsUsed: aiUsage.translationItemsUsed,
        ...translationRequests,
        membersAtLimit: atLimit.translationAtLimit,
      },
      photoLab: {
        used: aiUsage.photoLabUsed,
        membersAtLimit: atLimit.photoLabAtLimit,
      },
    },
    content,
    members,
  };
}
