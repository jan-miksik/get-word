-- Count of eligible study answers recorded since the mini-survey feature
-- shipped. Starts at 0 for every user (new and pre-existing) and is never
-- backfilled from historical review_events — see lib/db/schema.ts.
ALTER TABLE "users"
  ADD COLUMN "survey_progress_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
