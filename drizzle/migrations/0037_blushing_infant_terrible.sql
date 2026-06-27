CREATE TABLE "account_deletion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supabase_auth_id" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_deletion_jobs_supabase_auth_id_unique" UNIQUE("supabase_auth_id")
);
--> statement-breakpoint
ALTER TABLE "account_deletion_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "account_deletion_jobs_created_at_idx" ON "account_deletion_jobs" USING btree ("created_at");