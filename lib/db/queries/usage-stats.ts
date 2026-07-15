import { sql } from 'drizzle-orm';
import { db } from '../client';

export interface UsageWeekBucket {
  weekStart: string; // YYYY-MM-DD (UTC Monday)
  count: number;
  partial?: boolean; // current, still-running week
}

export interface StudyWeekBucket {
  weekStart: string;
  reviews: number;
  activeUsers: number;
  partial?: boolean;
}

export interface RetentionBucket {
  eligible: number;
  returned: number;
}

export interface UsageStats {
  generatedAt: string;
  registrations: {
    total: number;
    email: number;
    google: number;
    other: number;
    anonymous: number;
    weekly: UsageWeekBucket[];
  };
  activity: {
    dau: number;
    wau: number;
    mau: number;
    mauRegistered: number;
    mauAnonymous: number;
  };
  study: {
    known30d: number;
    reallyKnown30d: number;
    unknown30d: number;
    studyingUsers30d: number;
    weekly: StudyWeekBucket[];
  };
  content: {
    totalLists: number;
    publicLists: number;
    totalSubscriptions: number;
    topLists: {
      id: string;
      name: string;
      languageFrom: string;
      languageTo: string;
      subscriberCount: number;
    }[];
  };
  retention: {
    d1: RetentionBucket;
    d7: RetentionBucket;
    d30: RetentionBucket;
  };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TREND_WEEKS = 12;

function numberFromRow(row: Record<string, unknown>, key: string): number {
  return Number(row[key] ?? 0) || 0;
}

function firstRow(rows: unknown[]): Record<string, unknown> {
  return (rows[0] ?? {}) as Record<string, unknown>;
}

/** UTC Monday 00:00 of the week containing `date`. */
function getUtcMonday(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayFromMonday);
  return d;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Exactly TREND_WEEKS week-start strings ending with the current (partial) week. */
function weekStarts(currentWeekStart: Date): string[] {
  return Array.from({ length: TREND_WEEKS }, (_, i) =>
    toDateString(new Date(currentWeekStart.getTime() - (TREND_WEEKS - 1 - i) * WEEK_MS))
  );
}

function zeroFillWeeks<T extends { weekStart: string }>(
  starts: string[],
  rows: Map<string, Omit<T, 'weekStart' | 'partial'>>,
  empty: Omit<T, 'weekStart' | 'partial'>
): (T & { partial?: boolean })[] {
  return starts.map((weekStart, i) => ({
    weekStart,
    ...(rows.get(weekStart) ?? empty),
    ...(i === starts.length - 1 ? { partial: true } : {}),
  })) as (T & { partial?: boolean })[];
}

/**
 * Aggregate usage statistics for the admin dashboard.
 *
 * Notes on definitions:
 * - "registered" = supabase_auth_id IS NOT NULL AND registered_at IS NOT NULL.
 * - Activity (DAU/WAU/MAU) = any app open, via user_devices.last_seen_at
 *   (rolling 24h/7d/30d windows). Only the latest open per device is stored,
 *   so no historical app-open trend is possible — the weekly trend below is
 *   study activity from the append-only review_events table instead.
 * - Retention is rolling ("returned after N+ days"): of registered users old
 *   enough, share with >=1 review event >= N days after registered_at.
 */
export async function getUsageStats(): Promise<UsageStats> {
  const generatedAt = new Date();
  const dayAgo = new Date(generatedAt.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(generatedAt.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(generatedAt.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const d1Cutoff = dayAgo;
  const d7Cutoff = weekAgo;
  const d30Cutoff = monthAgo;

  const currentWeekStart = getUtcMonday(generatedAt);
  const oldestWeekStart = new Date(currentWeekStart.getTime() - (TREND_WEEKS - 1) * WEEK_MS);
  const nextWeekStart = new Date(currentWeekStart.getTime() + WEEK_MS);
  const weekWindowFrom = oldestWeekStart.toISOString();
  const weekWindowTo = nextWeekStart.toISOString();
  const starts = weekStarts(currentWeekStart);

  const registrationRows = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE supabase_auth_id IS NOT NULL)::int AS registered_total,
      count(*) FILTER (WHERE supabase_auth_id IS NOT NULL AND auth_provider = 'email')::int AS registered_email,
      count(*) FILTER (WHERE supabase_auth_id IS NOT NULL AND auth_provider = 'google')::int AS registered_google,
      count(*) FILTER (WHERE supabase_auth_id IS NOT NULL
        AND coalesce(auth_provider, 'unknown') NOT IN ('email', 'google'))::int AS registered_other,
      count(*) FILTER (WHERE supabase_auth_id IS NULL)::int AS anonymous_total
    FROM users
  `);

  const registrationWeeklyRows = await db.execute(sql`
    SELECT date_trunc('week', registered_at)::date::text AS week_start,
           count(*)::int AS registrations
    FROM users
    WHERE supabase_auth_id IS NOT NULL
      AND registered_at IS NOT NULL
      AND registered_at >= ${weekWindowFrom}::timestamp
      AND registered_at < ${weekWindowTo}::timestamp
    GROUP BY 1
    ORDER BY 1
  `);

  const activityRows = await db.execute(sql`
    SELECT
      count(DISTINCT ud.user_id) FILTER (WHERE ud.last_seen_at >= ${dayAgo}::timestamp)::int AS dau,
      count(DISTINCT ud.user_id) FILTER (WHERE ud.last_seen_at >= ${weekAgo}::timestamp)::int AS wau,
      count(DISTINCT ud.user_id) FILTER (WHERE ud.last_seen_at >= ${monthAgo}::timestamp)::int AS mau,
      count(DISTINCT ud.user_id) FILTER (WHERE ud.last_seen_at >= ${monthAgo}::timestamp
        AND u.supabase_auth_id IS NOT NULL)::int AS mau_registered,
      count(DISTINCT ud.user_id) FILTER (WHERE ud.last_seen_at >= ${monthAgo}::timestamp
        AND u.supabase_auth_id IS NULL)::int AS mau_anonymous
    FROM user_devices ud
    JOIN users u ON u.id = ud.user_id
  `);

  const studyRows = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE action = 'known')::int AS known_30d,
      count(*) FILTER (WHERE action = 'really_known')::int AS really_known_30d,
      count(*) FILTER (WHERE action = 'unknown')::int AS unknown_30d,
      count(DISTINCT user_id)::int AS studying_users_30d
    FROM review_events
    WHERE server_created_at >= ${monthAgo}::timestamp
  `);

  const studyWeeklyRows = await db.execute(sql`
    SELECT date_trunc('week', server_created_at)::date::text AS week_start,
           count(*)::int AS reviews,
           count(DISTINCT user_id)::int AS active_users
    FROM review_events
    WHERE server_created_at >= ${weekWindowFrom}::timestamp
      AND server_created_at < ${weekWindowTo}::timestamp
    GROUP BY 1
    ORDER BY 1
  `);

  const contentRows = await db.execute(sql`
    SELECT
      count(*)::int AS total_lists,
      count(*) FILTER (WHERE is_public)::int AS public_lists,
      (SELECT count(*) FROM user_list_subscriptions)::int AS total_subscriptions
    FROM word_lists
  `);

  const topListRows = await db.execute(sql`
    SELECT wl.id::text AS id,
           wl.name AS name,
           wl.language_from AS language_from,
           wl.language_to AS language_to,
           count(s.id)::int AS subscriber_count
    FROM word_lists wl
    JOIN user_list_subscriptions s ON s.list_id = wl.id
    GROUP BY wl.id, wl.name, wl.language_from, wl.language_to
    ORDER BY subscriber_count DESC, wl.name ASC
    LIMIT 10
  `);

  // Aggregate per user BEFORE counting: the LEFT JOIN multiplies rows per
  // review event, so eligible/returned must never be counted on the raw join.
  const retentionRows = await db.execute(sql`
    WITH per_user AS (
      SELECT u.id,
             u.registered_at,
             coalesce(bool_or(re.server_created_at >= u.registered_at + interval '1 day'), false) AS returned_d1,
             coalesce(bool_or(re.server_created_at >= u.registered_at + interval '7 days'), false) AS returned_d7,
             coalesce(bool_or(re.server_created_at >= u.registered_at + interval '30 days'), false) AS returned_d30
      FROM users u
      LEFT JOIN review_events re ON re.user_id = u.id
      WHERE u.supabase_auth_id IS NOT NULL AND u.registered_at IS NOT NULL
      GROUP BY u.id, u.registered_at
    )
    SELECT
      count(*) FILTER (WHERE registered_at <= ${d1Cutoff}::timestamp)::int AS d1_eligible,
      count(*) FILTER (WHERE registered_at <= ${d1Cutoff}::timestamp AND returned_d1)::int AS d1_returned,
      count(*) FILTER (WHERE registered_at <= ${d7Cutoff}::timestamp)::int AS d7_eligible,
      count(*) FILTER (WHERE registered_at <= ${d7Cutoff}::timestamp AND returned_d7)::int AS d7_returned,
      count(*) FILTER (WHERE registered_at <= ${d30Cutoff}::timestamp)::int AS d30_eligible,
      count(*) FILTER (WHERE registered_at <= ${d30Cutoff}::timestamp AND returned_d30)::int AS d30_returned
    FROM per_user
  `);

  const registration = firstRow(registrationRows);
  const activity = firstRow(activityRows);
  const study = firstRow(studyRows);
  const content = firstRow(contentRows);
  const retention = firstRow(retentionRows);

  const registrationWeekMap = new Map<string, { count: number }>();
  for (const raw of registrationWeeklyRows) {
    const row = raw as Record<string, unknown>;
    registrationWeekMap.set(String(row.week_start ?? ''), {
      count: numberFromRow(row, 'registrations'),
    });
  }

  const studyWeekMap = new Map<string, { reviews: number; activeUsers: number }>();
  for (const raw of studyWeeklyRows) {
    const row = raw as Record<string, unknown>;
    studyWeekMap.set(String(row.week_start ?? ''), {
      reviews: numberFromRow(row, 'reviews'),
      activeUsers: numberFromRow(row, 'active_users'),
    });
  }

  return {
    generatedAt: generatedAt.toISOString(),
    registrations: {
      total: numberFromRow(registration, 'registered_total'),
      email: numberFromRow(registration, 'registered_email'),
      google: numberFromRow(registration, 'registered_google'),
      other: numberFromRow(registration, 'registered_other'),
      anonymous: numberFromRow(registration, 'anonymous_total'),
      weekly: zeroFillWeeks<UsageWeekBucket>(starts, registrationWeekMap, { count: 0 }),
    },
    activity: {
      dau: numberFromRow(activity, 'dau'),
      wau: numberFromRow(activity, 'wau'),
      mau: numberFromRow(activity, 'mau'),
      mauRegistered: numberFromRow(activity, 'mau_registered'),
      mauAnonymous: numberFromRow(activity, 'mau_anonymous'),
    },
    study: {
      known30d: numberFromRow(study, 'known_30d'),
      reallyKnown30d: numberFromRow(study, 'really_known_30d'),
      unknown30d: numberFromRow(study, 'unknown_30d'),
      studyingUsers30d: numberFromRow(study, 'studying_users_30d'),
      weekly: zeroFillWeeks<StudyWeekBucket>(starts, studyWeekMap, { reviews: 0, activeUsers: 0 }),
    },
    content: {
      totalLists: numberFromRow(content, 'total_lists'),
      publicLists: numberFromRow(content, 'public_lists'),
      totalSubscriptions: numberFromRow(content, 'total_subscriptions'),
      topLists: topListRows.map((raw) => {
        const row = raw as Record<string, unknown>;
        return {
          id: String(row.id ?? ''),
          name: String(row.name ?? ''),
          languageFrom: String(row.language_from ?? ''),
          languageTo: String(row.language_to ?? ''),
          subscriberCount: numberFromRow(row, 'subscriber_count'),
        };
      }),
    },
    retention: {
      d1: {
        eligible: numberFromRow(retention, 'd1_eligible'),
        returned: numberFromRow(retention, 'd1_returned'),
      },
      d7: {
        eligible: numberFromRow(retention, 'd7_eligible'),
        returned: numberFromRow(retention, 'd7_returned'),
      },
      d30: {
        eligible: numberFromRow(retention, 'd30_eligible'),
        returned: numberFromRow(retention, 'd30_returned'),
      },
    },
  };
}
