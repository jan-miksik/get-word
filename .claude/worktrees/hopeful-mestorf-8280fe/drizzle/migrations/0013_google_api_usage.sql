CREATE TYPE "public"."google_api_scope" AS ENUM('translate', 'tts');--> statement-breakpoint
CREATE TABLE "google_api_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "scope" "google_api_scope" NOT NULL,
  "period_start" timestamp NOT NULL,
  "units" integer DEFAULT 0 NOT NULL,
  "request_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "google_api_usage_user_scope_period_unique" UNIQUE("user_id","scope","period_start")
);--> statement-breakpoint
ALTER TABLE "google_api_usage" ADD CONSTRAINT "google_api_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_api_usage_scope_period_idx" ON "google_api_usage" USING btree ("scope","period_start");--> statement-breakpoint
CREATE INDEX "google_api_usage_user_period_idx" ON "google_api_usage" USING btree ("user_id","period_start");
