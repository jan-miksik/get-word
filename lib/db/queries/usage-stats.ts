import { sql, type SQL } from 'drizzle-orm';
import { db } from '../client';

export type ActivityWindow = 'rolling' | 'calendar';

export interface UsageStatsOptions {
  activityWindow?: ActivityWindow;
  excludedUserIds?: string[];
  excludedUserEmails?: string[];
}

interface UsageWeekBucket {
  weekStart: string; // YYYY-MM-DD (UTC Monday)
  count: number;
  partial?: boolean; // current, still-running week
}

interface StudyWeekBucket {
  weekStart: string;
  reviews: number;
  activeUsers: number;
  partial?: boolean;
}

interface RetentionBucket {
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
    window: ActivityWindow;
    dau: number;
    wau: number;
    mau: number;
    yau: number;
    mauRegistered: number;
    mauAnonymous: number;
    yauRegistered: number;
    yauAnonymous: number;
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

function parseEnvList(value: string | undefined, normalize: (item: string) => string = (item) => item): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => normalize(item.trim()))
        .filter(Boolean)
    )
  );
}

function getEnvExcludedUserIds(): string[] {
  return parseEnvList(process.env.ADMIN_STATS_EXCLUDED_USER_IDS);
}

function getEnvExcludedUserEmails(): string[] {
  return parseEnvList(process.env.ADMIN_STATS_EXCLUDED_USER_EMAILS, (email) => email.toLowerCase());
}

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

function getUtcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getUtcYearStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
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

function sqlTextArray(values: string[]): SQL {
  return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`;
}

function excludedUserCondition(alias: string, options: Required<Pick<UsageStatsOptions, 'excludedUserIds' | 'excludedUserEmails'>>): SQL {
  const checks: SQL[] = [];
  const quotedAlias = sql.raw(alias);
  if (options.excludedUserIds.length > 0) {
    checks.push(sql`${quotedAlias}.id::text = ANY(${sqlTextArray(options.excludedUserIds)})`);
  }
  if (options.excludedUserEmails.length > 0) {
    checks.push(sql`lower(coalesce(${quotedAlias}.email, '')) = ANY(${sqlTextArray(options.excludedUserEmails)})`);
  }
  if (checks.length === 0) return sql`false`;
  return sql`coalesce((${sql.join(checks, sql` OR `)}), false)`;
}

function includedUserCondition(alias: string, options: Required<Pick<UsageStatsOptions, 'excludedUserIds' | 'excludedUserEmails'>>): SQL {
  return sql`NOT (${excludedUserCondition(alias, options)})`;
}

function normalizeActivityWindow(value: ActivityWindow | undefined): ActivityWindow {
  return value === 'calendar' ? 'calendar' : 'rolling';
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
 *
 * Test accounts can be excluded without a DB migration:
 * - ADMIN_STATS_EXCLUDED_USER_EMAILS: comma/space/semicolon-separated emails.
 * - ADMIN_STATS_EXCLUDED_USER_IDS: comma/space/semicolon-separated app user UUIDs.
 */
export async function getUsageStats(options: UsageStatsOptions = {}): Promise<UsageStats> {
  const generatedAt = new Date();
  const activityWindow = normalizeActivityWindow(options.activityWindow);
  const exclusionOptions = {
    excludedUserIds: options.excludedUserIds ?? getEnvExcludedUserIds(),
    excludedUserEmails: (options.excludedUserEmails ?? getEnvExcludedUserEmails()).map((email) => email.toLowerCase()),
  };

  const dayAgo = new Date(generatedAt.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(generatedAt.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(generatedAt.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const yearAgo = new Date(generatedAt.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const d1Cutoff = dayAgo;
  const d7Cutoff = weekAgo;
  const d30Cutoff = monthAgo;

  const currentWeekStart = getUtcMonday(generatedAt);
  const oldestWeekStart = new Date(currentWeekStart.getTime() - (TREND_WEEKS - 1) * WEEK_MS);
  const nextWeekStart = new Date(currentWeekStart.getTime() + WEEK_MS);
  const weekWindowFrom = oldestWeekStart.toISOString();
  const weekWindowTo = nextWeekStart.toISOString();
  const starts = weekStarts(currentWeekStart);
  const activityDayStart = activityWindow === 'calendar'
    ? new Date(Date.UTC(generatedAt.getUTCFullYear(), generatedAt.getUTCMonth(), generatedAt.getUTCDate())).toISOString()
    : dayAgo;
  const activityWeekStart = activityWindow === 'calendar' ? currentWeekStart.toISOString() : weekAgo;
  const activityMonthStart = activityWindow === 'calendar' ? getUtcMonthStart(generatedAt).toISOString() : monthAgo;
  const activityYearStart = activityWindow === 'calendar' ? getUtcYearStart(generatedAt).toISOString() : yearAgo;

  const registrationRows = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE supabase_auth_id IS NOT NULL)::int AS registered_total,
      count(*) FILTER (WHERE supabase_auth_id IS NOT NULL AND auth_provider = 'email')::int AS registered_email,
      count(*) FILTER (WHERE supabase_auth_id IS NOT NULL AND auth_provider = 'google')::int AS registered_google,
      count(*) FILTER (WHERE supabase_auth_id IS NOT NULL
        AND coalesce(auth_provider, 'unknown') NOT IN ('email', 'google'))::int AS registered_other,
      count(*) FILTER (WHERE supabase_auth_id IS NULL)::int AS anonymous_total
    FROM users u
    WHERE ${includedUserCondition('u', exclusionOptions)}
  `);

  const registrationWeeklyRows = await db.execute(sql`
    SELECT date_trunc('week', registered_at)::date::text AS week_start,
           count(*)::int AS registrations
    FROM users u
    WHERE ${includedUserCondition('u', exclusionOptions)}
      AND supabase_auth_id IS NOT NULL
      AND registered_at IS NOT NULL
      AND registered_at >= ${weekWindowFrom}::timestamp
      AND registered_at < ${weekWindowTo}::timestamp
    GROUP BY 1
    ORDER BY 1
  `);

  const activityRows = await db.execute(sql`
    SELECT
      count(DISTINCT ud.user_id) FILTER (WHERE ud.last_seen_at >= ${activityDayStart}::timestamp)::int AS dau,
      count(DISTINCT ud.user_id) FILTER (WHERE ud.last_seen_at >= ${activityWeekStart}::timestamp)::int AS wau,
      count(DISTINCT ud.user_id) FILTER (WHERE ud.last_seen_at >= ${activityMonthStart}::timestamp)::int AS mau,
      count(DISTINCT ud.user_id) FILTER (WHERE ud.last_seen_at >= ${activityYearStart}::timestamp)::int AS yau,
      count(DISTINCT ud.user_id) FILTER (WHERE ud.last_seen_at >= ${activityMonthStart}::timestamp
        AND u.supabase_auth_id IS NOT NULL)::int AS mau_registered,
      count(DISTINCT ud.user_id) FILTER (WHERE ud.last_seen_at >= ${activityMonthStart}::timestamp
        AND u.supabase_auth_id IS NULL)::int AS mau_anonymous,
      count(DISTINCT ud.user_id) FILTER (WHERE ud.last_seen_at >= ${activityYearStart}::timestamp
        AND u.supabase_auth_id IS NOT NULL)::int AS yau_registered,
      count(DISTINCT ud.user_id) FILTER (WHERE ud.last_seen_at >= ${activityYearStart}::timestamp
        AND u.supabase_auth_id IS NULL)::int AS yau_anonymous
    FROM user_devices ud
    JOIN users u ON u.id = ud.user_id
    WHERE ${includedUserCondition('u', exclusionOptions)}
  `);

  const studyRows = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE re.action = 'known')::int AS known_30d,
      count(*) FILTER (WHERE re.action = 'really_known')::int AS really_known_30d,
      count(*) FILTER (WHERE re.action = 'unknown')::int AS unknown_30d,
      count(DISTINCT re.user_id)::int AS studying_users_30d
    FROM review_events re
    JOIN users u ON u.id = re.user_id
    WHERE ${includedUserCondition('u', exclusionOptions)}
      AND re.server_created_at >= ${monthAgo}::timestamp
  `);

  const studyWeeklyRows = await db.execute(sql`
    SELECT date_trunc('week', re.server_created_at)::date::text AS week_start,
           count(*)::int AS reviews,
           count(DISTINCT re.user_id)::int AS active_users
    FROM review_events re
    JOIN users u ON u.id = re.user_id
    WHERE ${includedUserCondition('u', exclusionOptions)}
      AND re.server_created_at >= ${weekWindowFrom}::timestamp
      AND re.server_created_at < ${weekWindowTo}::timestamp
    GROUP BY 1
    ORDER BY 1
  `);

  const contentRows = await db.execute(sql`
    SELECT
      (
        SELECT count(*)::int
        FROM word_lists wl
        LEFT JOIN users owner ON owner.id = wl.owner_id
        WHERE ${includedUserCondition('owner', exclusionOptions)}
      ) AS total_lists,
      (
        SELECT count(*)::int
        FROM word_lists wl
        LEFT JOIN users owner ON owner.id = wl.owner_id
        WHERE ${includedUserCondition('owner', exclusionOptions)} AND wl.is_public
      ) AS public_lists,
      (
        SELECT count(*)::int
        FROM user_list_subscriptions s
        JOIN users u ON u.id = s.user_id
        WHERE ${includedUserCondition('u', exclusionOptions)}
      ) AS total_subscriptions
  `);

  const topListRows = await db.execute(sql`
    SELECT wl.id::text AS id,
           wl.name AS name,
           wl.language_from AS language_from,
           wl.language_to AS language_to,
           count(s.id)::int AS subscriber_count
    FROM word_lists wl
    JOIN user_list_subscriptions s ON s.list_id = wl.id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users owner ON owner.id = wl.owner_id
    WHERE ${includedUserCondition('u', exclusionOptions)}
      AND ${includedUserCondition('owner', exclusionOptions)}
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
      WHERE ${includedUserCondition('u', exclusionOptions)}
        AND u.supabase_auth_id IS NOT NULL AND u.registered_at IS NOT NULL
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
      window: activityWindow,
      dau: numberFromRow(activity, 'dau'),
      wau: numberFromRow(activity, 'wau'),
      mau: numberFromRow(activity, 'mau'),
      yau: numberFromRow(activity, 'yau'),
      mauRegistered: numberFromRow(activity, 'mau_registered'),
      mauAnonymous: numberFromRow(activity, 'mau_anonymous'),
      yauRegistered: numberFromRow(activity, 'yau_registered'),
      yauAnonymous: numberFromRow(activity, 'yau_anonymous'),
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
