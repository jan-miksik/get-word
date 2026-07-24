-- Photo-lab analysis events: one row per successfully returned photo analysis.
-- Behaviour only (a count of labels, never the image or the vocabulary text).
-- Powers the admin dashboard's photo metrics. ON DELETE CASCADE so "Delete my
-- account" / GDPR erasure removes the behavioural trace with the user.
CREATE TABLE IF NOT EXISTS "photo_analysis_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  "label_count" integer DEFAULT 0 NOT NULL,
  "language_from" text,
  "language_to" text,
  CONSTRAINT "photo_analysis_events_label_count_nonnegative" CHECK ("label_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "photo_analysis_events"
  ADD CONSTRAINT "photo_analysis_events_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_analysis_events_user_occurred_idx"
  ON "photo_analysis_events" ("user_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_analysis_events_occurred_idx"
  ON "photo_analysis_events" ("occurred_at");
