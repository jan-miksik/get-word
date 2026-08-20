ALTER TABLE "review_events" ADD COLUMN IF NOT EXISTS "local_day_key" date;
ALTER TABLE "activity_segments" ADD COLUMN IF NOT EXISTS "local_day_key" date;
ALTER TABLE "activity_segments" ADD COLUMN IF NOT EXISTS "timezone_at_creation" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_events_user_local_day_idx"
  ON "review_events" ("user_id", "local_day_key");
CREATE INDEX IF NOT EXISTS "activity_segments_user_local_day_idx"
  ON "activity_segments" ("user_id", "local_day_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_day_stats" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "day_key" date NOT NULL,
  "timezone" text NOT NULL,
  "active_ms" integer DEFAULT 0 NOT NULL,
  "answered_words" integer DEFAULT 0 NOT NULL,
  "goal_version_id" uuid REFERENCES "user_study_goal_versions"("id") ON DELETE SET NULL,
  "goal_days_per_week" integer,
  "goal_minutes" integer,
  "goal_words" integer,
  "met" boolean DEFAULT false NOT NULL,
  "first_activity_at" timestamptz,
  "last_activity_at" timestamptz,
  "computed_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "user_day_stats_pkey" PRIMARY KEY ("user_id", "day_key")
);
CREATE INDEX IF NOT EXISTS "user_day_stats_user_day_idx"
  ON "user_day_stats" ("user_id", "day_key" DESC);
