ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "settings_language_revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "language_pair_revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_applied_operations" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "client_op_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "sync_applied_operations_pkey" PRIMARY KEY ("user_id", "client_op_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_applied_operations_created_idx"
  ON "sync_applied_operations" ("created_at");
