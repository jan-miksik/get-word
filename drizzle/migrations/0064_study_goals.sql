ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "goal_revision" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "goal_reminder_enabled" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "goal_reminder_local_minutes" integer,
  ADD COLUMN IF NOT EXISTS "goal_intro_answered" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "study_pacing_seeded_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "timezone" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_study_goal_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "effective_from_day" date NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "goal_days_per_week" integer NOT NULL,
  "goal_minutes_per_day" integer NOT NULL,
  "goal_words_per_day" integer NOT NULL,
  "goal_preset" text NOT NULL,
  "pacing" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "user_study_goal_versions_user_day_unique" UNIQUE("user_id", "effective_from_day"),
  CONSTRAINT "user_study_goal_versions_days_check" CHECK ("goal_days_per_week" BETWEEN 1 AND 7),
  CONSTRAINT "user_study_goal_versions_minutes_check" CHECK ("goal_minutes_per_day" BETWEEN 1 AND 240),
  CONSTRAINT "user_study_goal_versions_words_check" CHECK ("goal_words_per_day" BETWEEN 1 AND 150),
  CONSTRAINT "user_study_goal_versions_preset_check" CHECK ("goal_preset" IN ('light', 'medium', 'intense', 'custom'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_study_goal_versions_user_day_idx"
  ON "user_study_goal_versions" ("user_id", "effective_from_day" DESC);
