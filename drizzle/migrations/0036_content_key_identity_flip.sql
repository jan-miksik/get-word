-- GATED FLIP — DO NOT APPLY before 0035 is live AND
-- scripts/backfill-content-keys.ts has run and reported verification passed.
-- This drops the item-id progress identity; if content_key is not yet
-- backfilled, existing progress will not project onto items (appears reset).
-- Deploy this together with the new content-keyed app code. See
-- docs/content-keyed-progress.md.
ALTER TABLE "user_progress" DROP CONSTRAINT "user_progress_user_word_list_item_unique";--> statement-breakpoint
DROP INDEX "user_progress_user_content_key_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "user_progress_user_content_key_unique" ON "user_progress" USING btree ("user_id","content_key") WHERE "user_progress"."content_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_progress_user_item_idx" ON "user_progress" USING btree ("user_id","word_list_item_id") WHERE "user_progress"."word_list_item_id" IS NOT NULL;