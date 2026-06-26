ALTER TABLE "user_progress" ADD COLUMN "content_key" text;--> statement-breakpoint
ALTER TABLE "word_list_items" ADD COLUMN "ignore_case" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "user_progress_user_content_key_idx" ON "user_progress" USING btree ("user_id","content_key") WHERE "user_progress"."content_key" IS NOT NULL;