-- One row per user and mini-survey, written once. The application layer
-- enforces write-once semantics with INSERT ... ON CONFLICT DO NOTHING (see
-- lib/db/queries/survey-responses.ts) so a later write for an already
-- answered/dismissed (user, survey) pair is silently ignored.
CREATE TABLE IF NOT EXISTS "survey_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "survey_id" text NOT NULL,
  "choice" text,
  "free_text" text,
  "dismissed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "survey_responses_user_survey_unique" UNIQUE("user_id", "survey_id")
);
--> statement-breakpoint
ALTER TABLE "survey_responses"
  ADD CONSTRAINT "survey_responses_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
