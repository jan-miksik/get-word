ALTER TABLE "user_memory_hooks" ALTER COLUMN "word_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_memory_hooks" ADD COLUMN "word_list_item_id" uuid;--> statement-breakpoint
ALTER TABLE "user_memory_hooks" ADD CONSTRAINT "user_memory_hooks_word_list_item_id_word_list_items_id_fk" FOREIGN KEY ("word_list_item_id") REFERENCES "public"."word_list_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memory_hooks" ADD CONSTRAINT "user_memory_hooks_user_id_word_list_item_id_unique" UNIQUE("user_id","word_list_item_id");--> statement-breakpoint
ALTER TABLE "user_memory_hooks" ADD CONSTRAINT "user_memory_hooks_has_word_or_item" CHECK ("word_id" IS NOT NULL OR "word_list_item_id" IS NOT NULL);
