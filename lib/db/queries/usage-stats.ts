import { sql, type SQL } from 'drizzle-orm';
import type {
  ActivityHeatmapDay,
  AdminUserRow,
  DeviceBreakdownBucket,
  DeviceFormFactor,
  DevicePlatform,
  PhotoUsageWeekBucket,
  StudyWeekBucket,
  UsageStats,
  UsageStatsOptions,
  UsageWeekBucket,
  UserActivityDay,
  WordChatUsageAccountRow,
  GoogleApiUsageSourceRow,
  UiLanguageRequestRow,
} from '@/features/admin/types';
import { PHOTO_ANALYSIS_TRACKING_STARTED_AT } from '@/features/photo-lab/server/analysis-events';
import { userHandle } from '@/features/admin/server/userHandle';
import { WORD_CHAT_MONTHLY_SPEND_LIMIT_USD } from '@/features/word-chat/server/config';
import { getActivityTotals, getUserActivityTotals } from './activity-stats';
import { getGoogleApiFreeMonthlyUnits } from './google-api-usage';
import { db } from '../client';
import {
  TREND_WEEKS,
  WEEK_MS,
  firstRow,
  getActivityWindowStarts,
  getUtcMonday,
  includedUserCondition,
  normalizeActivityWindow,
  numberFromRow,
  sqlTextArray,
  weekStarts,
  zeroFillWeeks,
} from './stats-shared';

/**
 * Cap on the gap between two consecutive answers when estimating active study
 * time. A longer pause counts as a break, not study.
 *
 * This whole estimate is an inference, superseded by the measured figures in
 * `activity_segments`. It is kept because it is the only signal that exists for
 * historical data, and because an overlap period lets the two be compared.
 * Compare it only against measured activity restricted to `surface = 'study'`,
 * and expect no fixed ordering between them: a learner answering every three
 * minutes has each gap credited almost in full here (under the cap) while the
 * tracker stops counting after 60 s of idle.
 */
const STUDY_INACTIVITY_CAP_SECONDS = 300;

/**
 * Inactivity that separates two study sessions. Matches `SESSION_GAP_MS` in the
 * activity tracker so "session" means the same thing in both figures.
 */
const STUDY_SESSION_GAP_SECONDS = 30 * 60;

/**
 * A client clock this far from the server's is not believable, so those rows
 * fall back to `server_created_at`.
 */
const CLIENT_CLOCK_TRUST_WINDOW = '2 days';

/** Weeks shown in the GitHub-style activity heatmap (≈ one year). */
const HEATMAP_WEEKS = 53;
const DEVICE_PLATFORMS: DevicePlatform[] = ['ios', 'android', 'macos', 'windows', 'linux', 'other', 'unknown'];
const DEVICE_FORM_FACTORS: DeviceFormFactor[] = ['mobile', 'tablet', 'desktop', 'unknown'];

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

function normalizeDevicePlatform(value: unknown): DevicePlatform {
  const normalized = String(value ?? 'unknown').toLowerCase();
  return DEVICE_PLATFORMS.includes(normalized as DevicePlatform)
    ? (normalized as DevicePlatform)
    : 'unknown';
}

function normalizeDeviceFormFactor(value: unknown): DeviceFormFactor {
  const normalized = String(value ?? 'unknown').toLowerCase();
  return DEVICE_FORM_FACTORS.includes(normalized as DeviceFormFactor)
    ? (normalized as DeviceFormFactor)
    : 'unknown';
}

/**
 * Run one panel's query, degrading to an empty panel instead of a dead page.
 *
 * Migrations here are applied by hand, so a deploy can legitimately run ahead
 * of its table for a while. Without this, one missing relation turns the whole
 * dashboard — registrations, retention, devices, spend — into a 500.
 */
async function executeOrEmpty(query: SQL, context: string): Promise<Record<string, unknown>[]> {
  try {
    return (await db.execute(query)) as unknown as Record<string, unknown>[];
  } catch (error) {
    console.error(`[usage-stats] ${context} unavailable`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
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
  const d1Cutoff = dayAgo;
  const d7Cutoff = weekAgo;
  const d30Cutoff = monthAgo;
  const currentMonthStart = new Date(
    Date.UTC(generatedAt.getUTCFullYear(), generatedAt.getUTCMonth(), 1)
  );
  const nextMonthStart = new Date(
    Date.UTC(generatedAt.getUTCFullYear(), generatedAt.getUTCMonth() + 1, 1)
  );

  const currentWeekStart = getUtcMonday(generatedAt);
  const oldestWeekStart = new Date(currentWeekStart.getTime() - (TREND_WEEKS - 1) * WEEK_MS);
  const nextWeekStart = new Date(currentWeekStart.getTime() + WEEK_MS);
  const weekWindowFrom = oldestWeekStart.toISOString();
  const weekWindowTo = nextWeekStart.toISOString();
  // GitHub-style activity heatmap window: HEATMAP_WEEKS full Monday-aligned weeks
  // back through the current (partial) week.
  const heatmapFrom = new Date(
    currentWeekStart.getTime() - (HEATMAP_WEEKS - 1) * WEEK_MS
  ).toISOString();
  const starts = weekStarts(currentWeekStart);
  const activityStarts = getActivityWindowStarts(activityWindow, generatedAt);
  const activityDayStart = activityStarts.day.toISOString();
  const activityWeekStart = activityStarts.week.toISOString();
  const activityMonthStart = activityStarts.month.toISOString();
  const activityYearStart = activityStarts.year.toISOString();

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

  const deviceSummaryRows = await db.execute(sql`
    WITH active_devices AS (
      SELECT ud.user_id,
             ud.device_id,
             lower(coalesce(ud.platform, 'unknown')) AS platform,
             lower(coalesce(ud.form_factor, 'unknown')) AS form_factor
      FROM user_devices ud
      JOIN users u ON u.id = ud.user_id
      WHERE ${includedUserCondition('u', exclusionOptions)}
        AND ud.last_seen_at >= ${monthAgo}::timestamp
    ),
    per_user AS (
      SELECT user_id, count(DISTINCT device_id) AS device_count
      FROM active_devices
      GROUP BY user_id
    )
    SELECT
      (SELECT count(*) FROM active_devices)::int AS active_devices_30d,
      (SELECT count(*) FROM active_devices WHERE platform <> 'unknown' OR form_factor <> 'unknown')::int AS known_devices_30d,
      (SELECT count(DISTINCT user_id) FROM active_devices WHERE platform = 'ios')::int AS ios_users_30d,
      (SELECT count(DISTINCT user_id) FROM active_devices WHERE platform = 'android')::int AS android_users_30d,
      (SELECT count(DISTINCT user_id) FROM active_devices WHERE form_factor IN ('mobile', 'tablet'))::int AS mobile_users_30d,
      (SELECT count(DISTINCT user_id) FROM active_devices WHERE form_factor = 'desktop')::int AS desktop_users_30d,
      (SELECT count(*) FROM per_user WHERE device_count >= 2)::int AS multi_device_users_30d
  `);

  const devicePlatformRows = await db.execute(sql`
    SELECT lower(coalesce(ud.platform, 'unknown')) AS bucket,
           count(DISTINCT ud.user_id)::int AS users
    FROM user_devices ud
    JOIN users u ON u.id = ud.user_id
    WHERE ${includedUserCondition('u', exclusionOptions)}
      AND ud.last_seen_at >= ${monthAgo}::timestamp
    GROUP BY 1
    ORDER BY users DESC, bucket ASC
  `);

  const deviceFormFactorRows = await db.execute(sql`
    SELECT lower(coalesce(ud.form_factor, 'unknown')) AS bucket,
           count(DISTINCT ud.user_id)::int AS users
    FROM user_devices ud
    JOIN users u ON u.id = ud.user_id
    WHERE ${includedUserCondition('u', exclusionOptions)}
      AND ud.last_seen_at >= ${monthAgo}::timestamp
    GROUP BY 1
    ORDER BY users DESC, bucket ASC
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

  // App-wide GitHub-style heatmap: distinct study-active users per calendar day
  // (UTC) over the heatmap window. Uses review_events — the only per-day history
  // (user_devices keeps only the latest open).
  const activityHeatmapRows = await db.execute(sql`
    SELECT (re.server_created_at)::date::text AS day,
           count(DISTINCT re.user_id)::int AS active_users
    FROM review_events re
    JOIN users u ON u.id = re.user_id
    WHERE ${includedUserCondition('u', exclusionOptions)}
      AND re.server_created_at >= ${heatmapFrom}::timestamp
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

  // active_subscriber_count = subscribers who actually studied the list in the
  // last 30 days (>=1 review event on one of the list's items), vs the raw
  // subscriber_count (who added it). The join path
  // review_events -> word_list_items -> word_lists is confirmed present.
  const topListRows = await db.execute(sql`
    SELECT wl.id::text AS id,
           wl.name AS name,
           wl.language_from AS language_from,
           wl.language_to AS language_to,
           count(s.id)::int AS subscriber_count,
           count(DISTINCT s.user_id) FILTER (WHERE EXISTS (
             SELECT 1 FROM review_events re
             JOIN word_list_items wli ON wli.id = re.word_list_item_id
             WHERE re.user_id = s.user_id
               AND wli.list_id = wl.id
               AND re.server_created_at >= ${monthAgo}::timestamp
           ))::int AS active_subscriber_count
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

  // Photo-lab aggregate. Includes all included users (even anonymous/device),
  // unlike the per-user "who to write to" table below which is registered-only.
  const photoRows = await db.execute(sql`
    WITH included_users AS (
      SELECT u.id FROM users u WHERE ${includedUserCondition('u', exclusionOptions)}
    ),
    per_user AS (
      SELECT pae.user_id,
             count(*) AS cnt,
             min(pae.occurred_at) AS first_at
      FROM photo_analysis_events pae
      JOIN included_users iu ON iu.id = pae.user_id
      GROUP BY pae.user_id
    )
    SELECT
      coalesce(sum(cnt), 0)::int AS total_analyses,
      count(*)::int AS photo_users,
      count(*) FILTER (WHERE cnt >= 2)::int AS repeat_users,
      min(first_at) AS first_event_at
    FROM per_user
  `);

  const photoWeeklyRows = await db.execute(sql`
    SELECT date_trunc('week', pae.occurred_at)::date::text AS week_start,
           count(*)::int AS analyses,
           count(DISTINCT pae.user_id)::int AS users
    FROM photo_analysis_events pae
    JOIN users u ON u.id = pae.user_id
    WHERE ${includedUserCondition('u', exclusionOptions)}
      AND pae.occurred_at >= ${weekWindowFrom}::timestamp
      AND pae.occurred_at < ${weekWindowTo}::timestamp
    GROUP BY 1
    ORDER BY 1
  `);

  // Current UTC calendar-month server-paid Word Chat usage. This includes
  // registered and device-only accounts that actually made a model call.
  // `model = 'n/a'` rows are funnel markers written at commit time, while
  // `__reserved__:*` rows are fail-closed budget holds whose real usage was not
  // observed. Neither is reported as a completed provider call.
  const wordChatAccountRows = await db.execute(sql`
    SELECT wcu.user_id::text AS id,
           u.email AS email,
           (u.supabase_auth_id IS NOT NULL) AS registered,
           count(*) FILTER (
             WHERE wcu.model <> 'n/a' AND left(wcu.model, 13) <> '__reserved__:'
           )::int AS calls,
           coalesce(sum(wcu.input_tokens) FILTER (
             WHERE left(wcu.model, 13) <> '__reserved__:'
           ), 0)::bigint AS input_tokens,
           coalesce(sum(wcu.output_tokens) FILTER (
             WHERE left(wcu.model, 13) <> '__reserved__:'
           ), 0)::bigint AS output_tokens,
           coalesce(sum(wcu.estimated_cost_usd) FILTER (
             WHERE left(wcu.model, 13) <> '__reserved__:'
           ), 0)::text AS estimated_cost_usd
    FROM word_chat_usage wcu
    JOIN users u ON u.id = wcu.user_id
    WHERE ${includedUserCondition('u', exclusionOptions)}
      AND wcu.created_at >= ${currentMonthStart.toISOString()}::timestamp
      AND wcu.created_at < ${nextMonthStart.toISOString()}::timestamp
    GROUP BY wcu.user_id, u.email, u.supabase_auth_id
    HAVING count(*) FILTER (
      WHERE wcu.model <> 'n/a' AND left(wcu.model, 13) <> '__reserved__:'
    ) > 0
    ORDER BY sum(wcu.estimated_cost_usd) FILTER (
      WHERE left(wcu.model, 13) <> '__reserved__:'
    ) DESC, wcu.user_id
  `);

  // Successful Google provider calls, including system/operator work without a
  // user id. This event ledger is distinct from the per-user reservation table:
  // it represents calls that actually reached Google and therefore explains the
  // Cloud Billing total by feature source.
  //
  // Degrades to an empty section rather than taking the whole dashboard down:
  // migrations here are applied by hand, so between deploying this code and
  // running 0059 the table does not exist yet. The write path in
  // `recordGoogleApiUsageEvent` swallows the same error for the same reason.
  const googleApiRows = await executeOrEmpty(
    sql`
      SELECT gaue.scope::text AS scope,
             gaue.source AS source,
             gaue.model AS model,
             coalesce(sum(gaue.units), 0)::bigint AS units,
             coalesce(sum(gaue.request_count), 0)::bigint AS requests
      FROM google_api_usage_events gaue
      LEFT JOIN users u ON u.id = gaue.user_id
      WHERE ${includedUserCondition('u', exclusionOptions)}
        AND gaue.created_at >= ${currentMonthStart.toISOString()}::timestamp
        AND gaue.created_at < ${nextMonthStart.toISOString()}::timestamp
      GROUP BY gaue.scope, gaue.source, gaue.model
      ORDER BY sum(gaue.units) DESC, sum(gaue.request_count) DESC, gaue.source
    `,
    'google_api_usage_events',
  );

  // Demand for new bundled interface languages. Like the Google ledger above,
  // this panel remains empty until its hand-run migration has been deployed.
  const uiLanguageRequestRows = await executeOrEmpty(
    sql`
      SELECT uilr.language_code,
             count(*)::int AS requesters,
             max(uilr.updated_at) AS last_requested_at
      FROM ui_language_requests uilr
      JOIN users u ON u.id = uilr.user_id
      WHERE ${includedUserCondition('u', exclusionOptions)}
      GROUP BY uilr.language_code
      ORDER BY count(*) DESC, max(uilr.updated_at) DESC, uilr.language_code
    `,
    'ui_language_requests',
  );

  // Per-user "who to write to" rows: registered users with an e-mail, including
  // one-time users (no activity filter). Each behavioural source is aggregated
  // to one row per user BEFORE the joins, so a user with several devices,
  // reviews, and photos cannot multiply and inflate the counts.
  const userRows = await db.execute(sql`
    WITH included_registered AS (
      SELECT u.id, u.email, u.created_at, u.registered_at, u.game_score
      FROM users u
      WHERE ${includedUserCondition('u', exclusionOptions)}
        AND u.supabase_auth_id IS NOT NULL
        AND u.email IS NOT NULL
    ),
    device_summary AS (
      SELECT user_id,
             max(last_seen_at) AS last_seen_at,
             count(DISTINCT device_id) AS device_count
      FROM user_devices
      GROUP BY user_id
    ),
    latest_device AS (
      SELECT DISTINCT ON (user_id)
             user_id,
             lower(coalesce(platform, 'unknown')) AS platform,
             lower(coalesce(form_factor, 'unknown')) AS form_factor
      FROM user_devices
      ORDER BY user_id, last_seen_at DESC NULLS LAST, first_seen_at DESC
    ),
    review_counts AS (
      SELECT user_id,
             count(*) AS review_count,
             count(DISTINCT (server_created_at)::date) AS active_days
      FROM review_events GROUP BY user_id
    ),
    -- client_created_at is when the learner actually answered.
    -- server_created_at is when the sync batch was inserted, and the outbox
    -- debounces 30 s and batches up to 25 ops, so consecutive answers land
    -- within milliseconds of each other. Measuring gaps on the server clock
    -- therefore reported flush cadence rather than study time. Rows whose
    -- client clock is implausible fall back to the server clock.
    answer_times AS (
      SELECT user_id,
             CASE
               WHEN client_created_at IS NULL
                 OR abs(EXTRACT(EPOCH FROM (client_created_at - server_created_at)))
                    > EXTRACT(EPOCH FROM INTERVAL ${sql.raw(`'${CLIENT_CLOCK_TRUST_WINDOW}'`)})
               THEN server_created_at
               ELSE client_created_at
             END AS answered_at
      FROM review_events
    ),
    -- Sessions are derived from the gaps themselves. The stored session_id is a
    -- payload-level value taken from sessionStorage at flush time, so it
    -- identifies a browser tab — which in a PWA can live for weeks — and not a
    -- study session. Deriving them here also stops excluding users whose events
    -- carried no session id at all.
    session_gaps AS (
      SELECT user_id,
             answered_at,
             CASE
               WHEN lag(answered_at) OVER w IS NULL
                 OR EXTRACT(EPOCH FROM (answered_at - lag(answered_at) OVER w))
                    > ${STUDY_SESSION_GAP_SECONDS}
               THEN 1 ELSE 0
             END AS is_new_session
      FROM answer_times
      WINDOW w AS (PARTITION BY user_id ORDER BY answered_at)
    ),
    session_marked AS (
      SELECT user_id,
             answered_at,
             sum(is_new_session) OVER (
               PARTITION BY user_id ORDER BY answered_at
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ) AS session_no
      FROM session_gaps
    ),
    -- The gap to the next answer is study time only when that answer is in the
    -- same session, so the lead is taken inside the session and not across the
    -- whole user. Taken across the user it would charge every session boundary
    -- the full inactivity cap — a week between two sessions is not five minutes
    -- of studying — and a user with a hundred sessions would collect eight
    -- invented hours. The last answer of a session now contributes nothing,
    -- which undercounts by one card's thinking time and invents none.
    session_spans AS (
      SELECT user_id,
             session_no,
             answered_at,
             lead(answered_at) OVER (
               PARTITION BY user_id, session_no ORDER BY answered_at
             ) AS next_at
      FROM session_marked
    ),
    session_stats AS (
      SELECT user_id,
             count(DISTINCT session_no) AS study_sessions,
             coalesce(sum(
               LEAST(
                 GREATEST(EXTRACT(EPOCH FROM (next_at - answered_at)), 0),
                 ${STUDY_INACTIVITY_CAP_SECONDS}
               )
             ) FILTER (WHERE next_at IS NOT NULL), 0) AS est_active_seconds
      FROM session_spans GROUP BY user_id
    ),
    photo_counts AS (
      SELECT user_id, count(*) AS photo_analyses
      FROM photo_analysis_events GROUP BY user_id
    )
    SELECT ir.id::text AS id,
           ir.email AS email,
           ir.created_at AS first_seen_at,
           ir.registered_at AS registered_at,
           ir.game_score AS game_score,
           ds.last_seen_at AS last_seen_at,
           coalesce(ds.device_count, 0)::int AS device_count,
           coalesce(ld.platform, 'unknown') AS last_device_platform,
           coalesce(ld.form_factor, 'unknown') AS last_device_form_factor,
           coalesce(rc.review_count, 0)::int AS review_count,
           coalesce(rc.active_days, 0)::int AS active_days,
           coalesce(ss.study_sessions, 0)::int AS study_sessions,
           coalesce(ss.est_active_seconds, 0)::int AS est_active_study_seconds,
           coalesce(pc.photo_analyses, 0)::int AS photo_analyses
    FROM included_registered ir
    LEFT JOIN device_summary ds ON ds.user_id = ir.id
    LEFT JOIN latest_device ld ON ld.user_id = ir.id
    LEFT JOIN review_counts rc ON rc.user_id = ir.id
    LEFT JOIN session_stats ss ON ss.user_id = ir.id
    LEFT JOIN photo_counts pc ON pc.user_id = ir.id
    ORDER BY ds.last_seen_at DESC NULLS LAST, ir.created_at DESC
    LIMIT 500
  `);

  // Per-user daily review counts for the mini heatmaps, restricted to exactly
  // the users returned above. Empty ARRAY is valid, so this always runs (keeps
  // the query sequence deterministic) and simply returns nothing when there are
  // no users.
  const userRowIds = userRows.map((raw) => String((raw as Record<string, unknown>).id ?? ''));
  const userDailyRows = await db.execute(sql`
    SELECT re.user_id::text AS user_id,
           (re.server_created_at)::date::text AS day,
           count(*)::int AS reviews
    FROM review_events re
    WHERE re.user_id::text = ANY(${sqlTextArray(userRowIds)})
      AND re.server_created_at >= ${heatmapFrom}::timestamp
    GROUP BY 1, 2
    ORDER BY 1, 2
  `);

  // Measured activity. Guarded like the other panels: migration 0061 is applied
  // by hand, so a deploy can legitimately run ahead of the table and must not
  // take the whole dashboard down with it.
  const [activityTotals, userActivityTotals] = await Promise.all([
    getActivityTotals(new Date(monthAgo), exclusionOptions).catch((error) => {
      console.error('[usage-stats] activity totals unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }),
    getUserActivityTotals(userRowIds, new Date(monthAgo)).catch(() => null),
  ]);

  const registration = firstRow(registrationRows);
  const activity = firstRow(activityRows);
  const deviceSummary = firstRow(deviceSummaryRows);
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

  const photo = firstRow(photoRows);
  const photoUsers = numberFromRow(photo, 'photo_users');
  const photoRepeatUsers = numberFromRow(photo, 'repeat_users');

  const photoWeekMap = new Map<string, { analyses: number; users: number }>();
  for (const raw of photoWeeklyRows) {
    const row = raw as Record<string, unknown>;
    photoWeekMap.set(String(row.week_start ?? ''), {
      analyses: numberFromRow(row, 'analyses'),
      users: numberFromRow(row, 'users'),
    });
  }

  const toIso = (value: unknown): string | null => {
    if (value == null) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };

  const dailyActivityByUser = new Map<string, UserActivityDay[]>();
  for (const raw of userDailyRows) {
    const row = raw as Record<string, unknown>;
    const userId = String(row.user_id ?? '');
    const list = dailyActivityByUser.get(userId) ?? [];
    list.push({ date: String(row.day ?? ''), count: numberFromRow(row, 'reviews') });
    dailyActivityByUser.set(userId, list);
  }

  const users: AdminUserRow[] = userRows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? '');
    return {
      handle: userHandle(id),
      email: String(row.email ?? ''),
      firstSeenAt: toIso(row.first_seen_at) ?? '',
      registeredAt: toIso(row.registered_at),
      lastSeenAt: toIso(row.last_seen_at),
      lastDevicePlatform: normalizeDevicePlatform(row.last_device_platform),
      lastDeviceFormFactor: normalizeDeviceFormFactor(row.last_device_form_factor),
      deviceCount: numberFromRow(row, 'device_count'),
      gameScore: numberFromRow(row, 'game_score'),
      reviewCount: numberFromRow(row, 'review_count'),
      activeDays: numberFromRow(row, 'active_days'),
      studySessions: numberFromRow(row, 'study_sessions'),
      estActiveStudySeconds: numberFromRow(row, 'est_active_study_seconds'),
      activeSeconds30d: userActivityTotals?.get(id)?.activeSeconds ?? 0,
      sessions30d: userActivityTotals?.get(id)?.sessions ?? 0,
      medianSessionSeconds: userActivityTotals?.get(id)?.medianSessionSeconds ?? 0,
      photoAnalyses: numberFromRow(row, 'photo_analyses'),
      dailyActivity: dailyActivityByUser.get(id) ?? [],
    };
  });

  const wordChatAccounts: WordChatUsageAccountRow[] = wordChatAccountRows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      handle: userHandle(String(row.id ?? '')),
      email: row.email == null ? null : String(row.email),
      registered: row.registered === true || row.registered === 'true',
      calls: numberFromRow(row, 'calls'),
      inputTokens: numberFromRow(row, 'input_tokens'),
      outputTokens: numberFromRow(row, 'output_tokens'),
      estimatedCostUsd: numberFromRow(row, 'estimated_cost_usd'),
    };
  });
  const wordChatTotals = wordChatAccounts.reduce(
    (totals, account) => ({
      calls: totals.calls + account.calls,
      inputTokens: totals.inputTokens + account.inputTokens,
      outputTokens: totals.outputTokens + account.outputTokens,
      estimatedCostUsd: totals.estimatedCostUsd + account.estimatedCostUsd,
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 }
  );

  const googleApiSources: GoogleApiUsageSourceRow[] = googleApiRows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      scope: row.scope === 'tts' ? 'tts' : 'translate',
      source: String(row.source ?? 'unknown'),
      model: row.model == null ? null : String(row.model),
      units: numberFromRow(row, 'units'),
      requests: numberFromRow(row, 'requests'),
    };
  });
  const translateUnits = googleApiSources
    .filter((row) => row.scope === 'translate')
    .reduce((total, row) => total + row.units, 0);
  const ttsUnits = googleApiSources
    .filter((row) => row.scope === 'tts')
    .reduce((total, row) => total + row.units, 0);
  const googleApiRequests = googleApiSources.reduce((total, row) => total + row.requests, 0);
  const translateFreeUnits = getGoogleApiFreeMonthlyUnits('translate');
  const ttsFreeUnits = getGoogleApiFreeMonthlyUnits('tts');
  const uiLanguageRequestLanguages: UiLanguageRequestRow[] = uiLanguageRequestRows.map((row) => ({
    languageCode: String(row.language_code ?? ''),
    requesters: numberFromRow(row, 'requesters'),
    lastRequestedAt: toIso(row.last_requested_at) ?? '',
  }));

  const platformBreakdown30d: DeviceBreakdownBucket[] = devicePlatformRows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      key: normalizeDevicePlatform(row.bucket),
      users: numberFromRow(row, 'users'),
    };
  });

  const formFactorBreakdown30d: DeviceBreakdownBucket[] = deviceFormFactorRows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      key: normalizeDeviceFormFactor(row.bucket),
      users: numberFromRow(row, 'users'),
    };
  });

  const activityHeatmap: ActivityHeatmapDay[] = activityHeatmapRows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return { date: String(row.day ?? ''), activeUsers: numberFromRow(row, 'active_users') };
  });

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
    devices: {
      activeDevices30d: numberFromRow(deviceSummary, 'active_devices_30d'),
      knownDevices30d: numberFromRow(deviceSummary, 'known_devices_30d'),
      iosUsers30d: numberFromRow(deviceSummary, 'ios_users_30d'),
      androidUsers30d: numberFromRow(deviceSummary, 'android_users_30d'),
      mobileUsers30d: numberFromRow(deviceSummary, 'mobile_users_30d'),
      desktopUsers30d: numberFromRow(deviceSummary, 'desktop_users_30d'),
      multiDeviceUsers30d: numberFromRow(deviceSummary, 'multi_device_users_30d'),
      platformBreakdown30d,
      formFactorBreakdown30d,
    },
    study: {
      known30d: numberFromRow(study, 'known_30d'),
      reallyKnown30d: numberFromRow(study, 'really_known_30d'),
      unknown30d: numberFromRow(study, 'unknown_30d'),
      studyingUsers30d: numberFromRow(study, 'studying_users_30d'),
      weekly: zeroFillWeeks<StudyWeekBucket>(starts, studyWeekMap, { reviews: 0, activeUsers: 0 }),
    },
    activity30d: {
      activeSeconds: activityTotals?.activeSeconds ?? 0,
      sessions: activityTotals?.sessions ?? 0,
      usersWithActivity: activityTotals?.usersWithActivity ?? 0,
      medianSessionSeconds: activityTotals?.medianSessionSeconds ?? 0,
      bySurface: activityTotals?.bySurface ?? [],
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
          activeSubscriberCount: numberFromRow(row, 'active_subscriber_count'),
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
    photo: {
      totalAnalyses: numberFromRow(photo, 'total_analyses'),
      users: photoUsers,
      repeatUsers: photoRepeatUsers,
      repeatRate: photoUsers === 0 ? 0 : photoRepeatUsers / photoUsers,
      trackedSince: PHOTO_ANALYSIS_TRACKING_STARTED_AT,
      firstEventAt: toIso(photo.first_event_at),
      weekly: zeroFillWeeks<PhotoUsageWeekBucket>(starts, photoWeekMap, { analyses: 0, users: 0 }),
    },
    wordChat: {
      monthStart: currentMonthStart.toISOString(),
      monthlyLimitUsd: WORD_CHAT_MONTHLY_SPEND_LIMIT_USD,
      ...wordChatTotals,
      accounts: wordChatAccounts,
    },
    googleApi: {
      monthStart: currentMonthStart.toISOString(),
      translateFreeUnits,
      ttsFreeUnits,
      translateUnits,
      ttsUnits,
      requests: googleApiRequests,
      estimatedTranslationCostUsd:
        Math.max(0, translateUnits - translateFreeUnits) * 20 / 1_000_000,
      sources: googleApiSources,
    },
    uiLanguageRequests: {
      totalRequests: uiLanguageRequestLanguages.reduce(
        (total, row) => total + row.requesters,
        0,
      ),
      languages: uiLanguageRequestLanguages,
    },
    activityHeatmap,
    users,
  };
}
