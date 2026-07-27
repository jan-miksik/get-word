-- Word chat: record which existing item a committed row was reused from.
--
-- The proposal call no longer receives a corpus; it writes free text and the
-- server matches that text against every translated item in the language pair,
-- including ordinary public lists whose translations nobody has checked. That
-- reuse is deliberate — a fresh translation would usually land on the same
-- answer, and a match brings the already-generated audio with it — but it means
-- unreviewed pairs now propagate into learners' personal lists.
--
-- Without this column there is no way to find them again. With it, "every item
-- copied from an unverified source" is one join to `word_lists`, which is what
-- makes the planned per-translation verification tiers backfillable.
--
-- Nullable, ON DELETE SET NULL: this is provenance, not a dependency. Deleting
-- the source list must never touch the learner's copy.
ALTER TABLE "word_list_items"
  ADD COLUMN IF NOT EXISTS "source_item_id" uuid;
--> statement-breakpoint

ALTER TABLE "word_list_items"
  DROP CONSTRAINT IF EXISTS "word_list_items_source_item_id_fk";
--> statement-breakpoint

ALTER TABLE "word_list_items"
  ADD CONSTRAINT "word_list_items_source_item_id_fk"
  FOREIGN KEY ("source_item_id") REFERENCES "public"."word_list_items"("id")
  ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint

-- Partial: the overwhelming majority of items are not copies.
CREATE INDEX IF NOT EXISTS "word_list_items_source_item_idx"
  ON "word_list_items" ("source_item_id")
  WHERE "source_item_id" IS NOT NULL;
