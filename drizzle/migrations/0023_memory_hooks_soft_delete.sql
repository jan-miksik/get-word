ALTER TABLE "user_memory_hooks" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memory_hooks_updated_at_idx" ON "user_memory_hooks" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_progress_updated_at_idx" ON "user_progress" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_category_filters_user_id_idx" ON "user_category_filters" USING btree ("user_id");
