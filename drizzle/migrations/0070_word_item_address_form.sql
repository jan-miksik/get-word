-- Per-item form of address (familiar/polite) for languages with a binary system.
-- Deliberately NOT named "register": a previous `register` column (0032, dropped
-- in 0033) held a batch-level guess on every row. This one is asserted per item,
-- only where the two forms genuinely differ, and the name stays free for a real
-- linguistic register field later.
--
-- Shape: { "version": 1, "form": "familiar" | "polite", "groupId"?: string }
-- `groupId` links exactly the two members of one pair; it is absent when the item
-- stands alone. The sibling's text is never denormalized here.
ALTER TABLE "word_list_items"
  ADD COLUMN IF NOT EXISTS "address_form" jsonb;
