CREATE INDEX "word_lists_owner_idx" ON "word_lists" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "word_lists_public_idx" ON "word_lists" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "word_categories_list_pos_idx" ON "word_categories" USING btree ("list_id","position");--> statement-breakpoint
CREATE INDEX "word_list_items_list_pos_idx" ON "word_list_items" USING btree ("list_id","position");
