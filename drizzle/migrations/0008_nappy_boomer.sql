DROP INDEX "user_progress_user_item_idx";--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_word_list_item_unique" UNIQUE("user_id","word_list_item_id");