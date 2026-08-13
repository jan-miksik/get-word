CREATE TABLE IF NOT EXISTS "google_api_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "scope" "google_api_scope" NOT NULL,
  "source" text NOT NULL,
  "model" text,
  "units" integer DEFAULT 0 NOT NULL,
  "request_count" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "google_api_usage_events_units_nonnegative" CHECK ("units" >= 0),
  CONSTRAINT "google_api_usage_events_request_count_nonnegative" CHECK ("request_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "google_api_usage_events"
  ADD CONSTRAINT "google_api_usage_events_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_api_usage_events_created_idx"
  ON "google_api_usage_events" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_api_usage_events_scope_created_idx"
  ON "google_api_usage_events" ("scope", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_api_usage_events_source_created_idx"
  ON "google_api_usage_events" ("source", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_api_usage_events_user_created_idx"
  ON "google_api_usage_events" ("user_id", "created_at");
