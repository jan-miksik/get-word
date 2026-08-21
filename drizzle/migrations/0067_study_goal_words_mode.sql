DO $$ BEGIN
  CREATE TYPE "review_event_kind" AS ENUM ('introduction', 'review');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "user_progress"
  ADD COLUMN IF NOT EXISTS "introduced_at" timestamp;
UPDATE "user_progress"
  SET "introduced_at" = COALESCE(
    (
      SELECT min(e."client_created_at")
      FROM "review_events" e
      WHERE e."user_id" = "user_progress"."user_id"
        AND (
          ("user_progress"."word_list_item_id" IS NOT NULL
            AND e."word_list_item_id" = "user_progress"."word_list_item_id")
          OR ("user_progress"."word_id" IS NOT NULL
            AND e."word_id" = "user_progress"."word_id")
        )
    ),
    "last_known_at", "last_unknown_at", "created_at"
  )
  WHERE "introduced_at" IS NULL
    AND (
      ("known_count" + "unknown_count") > 0
      OR "stage_index" > 0
      OR "next_due_at" IS NOT NULL
      OR "last_known_at" IS NOT NULL
      OR "last_unknown_at" IS NOT NULL
    );
-- Rows still NULL after this statement are the only historical rows that may
-- mean "never introduced". Historic review event classifications stay NULL:
-- only events written after this migration claim a server-derived kind.
--> statement-breakpoint
ALTER TABLE "review_events"
  ADD COLUMN IF NOT EXISTS "event_kind" "review_event_kind",
  ADD COLUMN IF NOT EXISTS "previous_due_at" timestamp,
  ADD COLUMN IF NOT EXISTS "counts_toward_daily_review" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "user_study_goal_versions"
  ADD COLUMN IF NOT EXISTS "goal_mode" text NOT NULL DEFAULT 'minutes',
  ADD COLUMN IF NOT EXISTS "goal_new_words_per_day" integer;
ALTER TABLE "user_study_goal_versions"
  ALTER COLUMN "goal_minutes_per_day" DROP NOT NULL,
  ALTER COLUMN "goal_words_per_day" DROP NOT NULL;
ALTER TABLE "user_study_goal_versions"
  DROP CONSTRAINT IF EXISTS "user_study_goal_versions_mode_check";
ALTER TABLE "user_study_goal_versions"
  ADD CONSTRAINT "user_study_goal_versions_mode_check" CHECK (
    ("goal_mode" = 'minutes' AND "goal_minutes_per_day" IS NOT NULL AND "goal_new_words_per_day" IS NULL)
    OR ("goal_mode" = 'words' AND "goal_new_words_per_day" BETWEEN 1 AND 30 AND "goal_minutes_per_day" IS NULL)
  );
--> statement-breakpoint
ALTER TABLE "user_day_stats"
  ADD COLUMN IF NOT EXISTS "goal_mode" text,
  ADD COLUMN IF NOT EXISTS "goal_status" text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "snapshot_created_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "available_new_words" integer,
  ADD COLUMN IF NOT EXISTS "due_review_count" integer,
  ADD COLUMN IF NOT EXISTS "resolved_new_target" integer,
  ADD COLUMN IF NOT EXISTS "resolved_review_target" integer,
  ADD COLUMN IF NOT EXISTS "resolved_item_budget" integer,
  ADD COLUMN IF NOT EXISTS "resolved_minutes_budget" integer,
  ADD COLUMN IF NOT EXISTS "introduced_words" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reviewed_words" integer NOT NULL DEFAULT 0;
