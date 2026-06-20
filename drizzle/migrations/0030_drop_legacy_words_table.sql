-- Phase 3: drop the legacy `words` table.
--
-- Pre-flight counts showed 0 legacy-only rows in user_progress and
-- review_events. ~90 user_memory_hooks were still keyed only by the legacy
-- word_id; per product decision these are allowed to orphan (they simply stop
-- surfacing). The word_id COLUMNS are kept (only their FKs are dropped), so the
-- orphaned hook rows remain in place rather than being deleted.
ALTER TABLE "review_events" DROP CONSTRAINT IF EXISTS "review_events_word_id_words_id_fk";--> statement-breakpoint
ALTER TABLE "user_memory_hooks" DROP CONSTRAINT IF EXISTS "user_memory_hooks_word_id_words_id_fk";--> statement-breakpoint
ALTER TABLE "user_progress" DROP CONSTRAINT IF EXISTS "user_progress_word_id_words_id_fk";--> statement-breakpoint
DROP TABLE "words" CASCADE;
