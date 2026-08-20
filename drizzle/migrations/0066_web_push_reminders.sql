CREATE TABLE IF NOT EXISTS "web_push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "last_success_at" timestamptz,
  "last_failure_at" timestamptz,
  "failure_count" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "web_push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "web_push_subscriptions_user_updated_idx"
  ON "web_push_subscriptions" ("user_id", "updated_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "web_push_reminder_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  -- Keep the user/day delivery row when an expired endpoint is removed. It is
  -- the daily dedupe record; cascading it away could send a second reminder
  -- after the browser re-subscribes inside the same delivery window.
  "subscription_id" uuid REFERENCES "web_push_subscriptions"("id") ON DELETE SET NULL,
  "day_key" date NOT NULL,
  "scheduled_for" timestamptz NOT NULL,
  "claimed_at" timestamptz DEFAULT now() NOT NULL,
  "sent_at" timestamptz,
  CONSTRAINT "web_push_reminder_deliveries_user_day_unique" UNIQUE("user_id", "day_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "web_push_reminder_deliveries_subscription_idx"
  ON "web_push_reminder_deliveries" ("subscription_id", "day_key" DESC);
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
      SELECT enabled
      FROM user_study_goal_versions
      WHERE user_id = u.id
        AND effective_from_day <= local_day.day_key
      ORDER BY effective_from_day DESC
      LIMIT 1
    ) goal ON goal.enabled
    JOIN web_push_subscriptions s ON s.user_id = u.id
    WHERE u.goal_reminder_enabled
      -- A 15-minute grace window tolerates a delayed ten-minute cron run while
      -- still keeping the reminder close to the learner's chosen local time.
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
CREATE OR REPLACE FUNCTION public.complete_web_push_reminder_delivery(
  p_delivery_id uuid,
  p_success boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_success THEN
    UPDATE web_push_reminder_deliveries
    SET sent_at = now()
    WHERE id = p_delivery_id;
  ELSE
    DELETE FROM web_push_reminder_deliveries
    WHERE id = p_delivery_id
      AND sent_at IS NULL;
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_due_web_push_reminders(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_web_push_reminder_delivery(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_web_push_reminders(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_web_push_reminder_delivery(uuid, boolean) TO service_role;
