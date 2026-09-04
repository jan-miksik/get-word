-- Send the reminder in the learner's own interface language.
--
-- The push payload is built on the server, so the browser's dictionary never
-- sees it: without the language travelling with the claim, every learner gets
-- English. The sender falls back to English for a language it has no copy of
-- (`supabase/functions/send-study-reminders/messages.ts`).
--
-- The language is asked of three sources in order, because the obvious one is
-- mostly empty: `users.settings_language` is only written when a learner opens
-- the language picker and chooses, so 19 of 23 accounts had it null while their
-- interface was happily running in Czech from a browser-detected locale. The
-- subscription's own language is recorded by the browser at the moment it
-- subscribes, so it is always present and is per device — a Czech phone and an
-- English laptop each get their own. `users.language_from` is the last resort
-- before English: the language a learner studies *from* is one they read.
--
-- Adding a column to the result set changes the function's return type, which
-- CREATE OR REPLACE cannot do, so the old signature is dropped first. The
-- function is only ever called by the Edge Function through service_role, and
-- a claim missed in that instant is retried by the next ten-minute run.
ALTER TABLE "web_push_subscriptions"
  ADD COLUMN IF NOT EXISTS "language" text;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.claim_due_web_push_reminders(integer);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.claim_due_web_push_reminders(p_limit integer DEFAULT 100)
RETURNS TABLE (
  delivery_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  user_id uuid,
  day_key date,
  scheduled_for timestamptz,
  reminder_language text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT DISTINCT ON (u.id)
      u.id AS user_id,
      s.id AS subscription_id,
      s.endpoint,
      s.p256dh,
      s.auth,
      local_day.day_key,
      scheduled.scheduled_for,
      COALESCE(
        NULLIF(s.language, ''),
        NULLIF(u.settings_language, ''),
        NULLIF(u.language_from, '')
      ) AS reminder_language
    FROM users u
    JOIN LATERAL (
      SELECT COALESCE(
        (SELECT name FROM pg_timezone_names WHERE name = NULLIF(u.timezone, '') LIMIT 1),
        'UTC'
      ) AS timezone_name
    ) zone ON true
    JOIN LATERAL (
      SELECT (now() AT TIME ZONE zone.timezone_name)::date AS day_key
    ) local_day ON true
    JOIN LATERAL (
      SELECT (
        local_day.day_key::timestamp
        + make_interval(mins => COALESCE(u.goal_reminder_local_minutes, 1140))
      ) AT TIME ZONE zone.timezone_name AS scheduled_for
    ) scheduled ON true
    JOIN LATERAL (
      SELECT enabled, goal_weekdays, goal_days_per_week
      FROM user_study_goal_versions
      WHERE user_id = u.id
        AND effective_from_day <= local_day.day_key
      ORDER BY effective_from_day DESC
      LIMIT 1
    ) goal ON goal.enabled
    JOIN web_push_subscriptions s ON s.user_id = u.id
    WHERE u.goal_reminder_enabled
      AND u.goal_reminder_intro_answered
      AND (
        goal.goal_weekdays IS NULL
        OR EXTRACT(ISODOW FROM local_day.day_key)::integer = ANY(goal.goal_weekdays)
      )
      AND now() >= scheduled.scheduled_for
      AND now() < scheduled.scheduled_for + interval '15 minutes'
      AND NOT EXISTS (
        SELECT 1
        FROM user_day_stats stats
        WHERE stats.user_id = u.id
          AND stats.day_key = local_day.day_key
          AND stats.met
      )
      -- The week is counted from its ISO Monday, matching `isoWeekStart` on the
      -- client. Today cannot contribute here: the clause above already excludes
      -- a day the learner has met.
      AND (
        SELECT count(*)
        FROM user_day_stats week_stats
        WHERE week_stats.user_id = u.id
          AND week_stats.met
          AND week_stats.day_key >= (date_trunc('week', local_day.day_key::timestamp))::date
          AND week_stats.day_key <= local_day.day_key
      ) < goal.goal_days_per_week
    ORDER BY u.id, s.updated_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 500))
  ), claimed AS (
    INSERT INTO web_push_reminder_deliveries (
      user_id, subscription_id, day_key, scheduled_for
    )
    SELECT user_id, subscription_id, day_key, scheduled_for
    FROM candidates
    ON CONFLICT (user_id, day_key) DO NOTHING
    RETURNING id, user_id, subscription_id, day_key, scheduled_for
  )
  SELECT claimed.id, claimed.subscription_id, candidates.endpoint,
    candidates.p256dh, candidates.auth, claimed.user_id, claimed.day_key,
    claimed.scheduled_for, candidates.reminder_language
  FROM claimed
  JOIN candidates
    ON candidates.user_id = claimed.user_id
    AND candidates.subscription_id = claimed.subscription_id;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_due_web_push_reminders(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_web_push_reminders(integer) TO service_role;
