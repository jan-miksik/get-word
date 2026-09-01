-- Editor action history for the quality pool.
--
-- The pool table holds only the LAST state: one `reviewed_at`, one
-- `suggestion_version`, one set of audio counts. That is enough to work from
-- and useless to look back on — there is no way to see that a pair was marked
-- ok, then re-recorded twice, and by whom.
--
-- This is append-only and deliberately narrow: EDITOR actions only. The scan
-- and the LLM audit run over thousands of pairs at a time and would bury the
-- few rows a human actually caused.
--
-- The privacy rule of the pool holds here too: the only user id is the editor,
-- never an author, and the payload carries COUNTS of affected items — never an
-- item id, a list id, or an owner id, which is what would turn this table into
-- a content → learner join.
CREATE TABLE IF NOT EXISTS "content_quality_events" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cascade, like dismissals: purge is existence-based, so a pair disappearing
  -- from here means nobody is studying it anywhere any more, and a trail about
  -- content that no longer exists is not worth keeping alive.
  "pool_key"       text NOT NULL
                   REFERENCES "content_quality_reviews"("pool_key") ON DELETE CASCADE,
  -- The editor. `set null` so account deletion never blocks on the trail.
  "actor_user_id"  uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action"         text NOT NULL,
  -- 'known' | 'target' for audio actions, NULL for verdicts.
  "side"           text,
  -- Action-specific detail: verdict before/after, suggested text, voice id,
  -- content hash, how many items were linked or replaced.
  "detail"         jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"     timestamp NOT NULL DEFAULT now(),

  CONSTRAINT "content_quality_events_action_check"
    CHECK ("action" IN ('verdict', 'suggestion', 'audio_filled', 'audio_replaced')),
  CONSTRAINT "content_quality_events_side_check"
    CHECK ("side" IS NULL OR "side" IN ('known', 'target'))
);

-- The only read is "this pair's history, newest first".
CREATE INDEX IF NOT EXISTS "content_quality_events_pool_key_idx"
  ON "content_quality_events" ("pool_key", "created_at" DESC);

ALTER TABLE "content_quality_events" ENABLE ROW LEVEL SECURITY;
