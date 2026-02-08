ALTER TABLE "users" ADD COLUMN "user_role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_english" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_category_badges" boolean DEFAULT false NOT NULL;