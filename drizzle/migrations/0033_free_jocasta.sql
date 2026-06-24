ALTER TABLE "word_list_items" DROP CONSTRAINT IF EXISTS "word_list_items_register_check";--> statement-breakpoint
ALTER TABLE "word_list_items" DROP COLUMN IF EXISTS "register";
