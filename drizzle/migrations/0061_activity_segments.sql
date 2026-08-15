CREATE TABLE IF NOT EXISTS "activity_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "client_segment_id" text NOT NULL,
  "device_id" text,
  "session_id" text NOT NULL,
  "surface" text NOT NULL,
  "started_at" timestamptz NOT NULL,
  "ended_at" timestamptz NOT NULL,
  "active_ms" integer NOT NULL,
  "interactions" integer DEFAULT 0 NOT NULL,
  "server_created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "activity_segments_user_client_unique" UNIQUE ("user_id", "client_segment_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_segments_user_started_idx"
  ON "activity_segments" ("user_id", "started_at");
