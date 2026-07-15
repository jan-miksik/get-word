ALTER TABLE "word_list_items"
  ADD COLUMN "accepted_known" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "word_list_items"
  ADD COLUMN "accepted_target" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
