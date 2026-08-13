CREATE TABLE IF NOT EXISTS "ui_language_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "language_code" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ui_language_requests_user_language_unique" UNIQUE("user_id", "language_code")
);
--> statement-breakpoint
ALTER TABLE "ui_language_requests"
  ADD CONSTRAINT "ui_language_requests_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ui_language_requests_language_updated_idx"
  ON "ui_language_requests" ("language_code", "updated_at");
