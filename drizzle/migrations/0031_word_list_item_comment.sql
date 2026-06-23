ALTER TABLE "users" ADD COLUMN "study_notes_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "study_note_minimize_from_stage" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "word_list_items" ADD COLUMN "comment" jsonb;
