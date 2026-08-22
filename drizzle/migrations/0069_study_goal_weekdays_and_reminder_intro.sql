ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "goal_reminder_intro_answered" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Do not interrupt learners who already had a live goal before this onboarding
-- step existed. Accounts without an active goal stay false and see the choice
-- immediately after creating one.
UPDATE "users" u
SET "goal_reminder_intro_answered" = true
WHERE EXISTS (
  SELECT 1
  FROM LATERAL (
    SELECT g."enabled"
    FROM "user_study_goal_versions" g
    WHERE g."user_id" = u."id"
      AND g."effective_from_day" <= CURRENT_DATE
    ORDER BY g."effective_from_day" DESC
    LIMIT 1
  ) active_goal
  WHERE active_goal."enabled"
);
--> statement-breakpoint
ALTER TABLE "user_study_goal_versions"
  ADD COLUMN IF NOT EXISTS "goal_weekdays" integer[];
ALTER TABLE "user_study_goal_versions"
  DROP CONSTRAINT IF EXISTS "user_study_goal_versions_weekdays_check";
ALTER TABLE "user_study_goal_versions"
  ADD CONSTRAINT "user_study_goal_versions_weekdays_check" CHECK (
    "goal_weekdays" IS NULL OR (
      cardinality("goal_weekdays") BETWEEN 1 AND 7
      AND "goal_weekdays" <@ ARRAY[1,2,3,4,5,6,7]::integer[]
      AND cardinality("goal_weekdays") = "goal_days_per_week"
    )
  );
--> statement-breakpoint
ALTER TABLE "user_study_goal_versions"
  DROP CONSTRAINT IF EXISTS "user_study_goal_versions_minutes_check";
ALTER TABLE "user_study_goal_versions"
  ADD CONSTRAINT "user_study_goal_versions_minutes_check" CHECK (
    "goal_minutes_per_day" IS NULL OR "goal_minutes_per_day" BETWEEN 1 AND 480
  );
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
  scheduled_for timestamptz
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
      scheduled.scheduled_for
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
      SELECT enabled, goal_weekdays
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
    claimed.scheduled_for
  FROM claimed
  JOIN candidates
    ON candidates.user_id = claimed.user_id
    AND candidates.subscription_id = claimed.subscription_id;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_due_web_push_reminders(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_web_push_reminders(integer) TO service_role;
