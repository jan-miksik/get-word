-- Who counts as a "prior user" for a survey that asks about recent changes.
--
-- Stamped by this migration rather than compared against a hard-coded rollout
-- timestamp: applying migrations to an environment IS that environment's
-- rollout moment, so everyone who exists here right now was here before the
-- change, and everyone created afterwards was not. That removes both the
-- placeholder-date guesswork and the previous `review_events` EXISTS probe,
-- which decayed to "nobody is eligible" once the 30-day compaction window
-- passed the cutoff (see scripts/compact-review-events.ts).
ALTER TABLE "users"
  ADD COLUMN "survey_prior_user" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "users" SET "survey_prior_user" = true;
