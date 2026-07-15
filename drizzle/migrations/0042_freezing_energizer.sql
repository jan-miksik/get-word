ALTER TABLE "users" ADD COLUMN "registered_at" timestamp;
--> statement-breakpoint
-- Backfill: for users registered before this column existed, created_at is the
-- best available approximation (device-claim users actually registered later).
UPDATE "users" SET "registered_at" = "created_at" WHERE "supabase_auth_id" IS NOT NULL;
