-- Quality pool: an editor-facing view of every word pair in private owned
-- lists, aggregated by content so no user identity, list name, or learner
-- category name is ever attached. Consumes `word_lists.review_opt_in` and
-- `word_categories.review_label`, which were added for exactly this and have
-- had no reader until now.
--
-- Deliberately NOT called "anonymized": we strip identity and names, but the
-- text itself is whatever the learner typed and may contain personal detail.

-- Two separate consents. Showing a pair to a project editor and shipping it to
-- a third-party LLM are different asks and must not share one switch.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "review_opt_in" boolean NOT NULL DEFAULT true;
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "ai_review_opt_in" boolean NOT NULL DEFAULT false;

-- One row per normalized pair, keyed by a length-prefixed digest so two
-- different quadruples can never serialize to the same input. See
-- lib/db/queries/quality-pool.ts for the single definition of the key.
CREATE TABLE IF NOT EXISTS "content_quality_reviews" (
  "pool_key"                   text PRIMARY KEY,
  "language_from"              text NOT NULL,
  "language_to"                text NOT NULL,
  "text_known"                 text NOT NULL,
  "text_target"                text NOT NULL,

  -- Deterministic heuristics (lib/translation-validate.ts, lib/formatting-polish.ts,
  -- lib/audio-quality.ts) plus the corpus-wide ones the scan adds.
  "heuristic_flags"            jsonb NOT NULL DEFAULT '[]'::jsonb,
  "heuristic_version"          integer,
  "heuristic_scanned_at"       timestamp,

  -- Batched LLM audit. Cache is valid only for the current audit version, so
  -- changing the prompt, the rules, or the model invalidates old scores.
  "llm_score"                  smallint,
  "llm_reason"                 text,
  "llm_suggested_target"       text,
  "llm_model"                  text,
  "llm_audit_version"          integer,
  "llm_checked_at"             timestamp,

  -- Editor verdict. Both generations are snapshotted because an editor judges
  -- from heuristics, audio, the LLM, and their own knowledge — a single
  -- version number would claim more than it knows.
  "verdict"                    text NOT NULL DEFAULT 'unreviewed',
  "reviewed_heuristic_version" integer,
  "reviewed_llm_audit_version" integer,
  "suggested_known"            text,
  "suggested_target"           text,
  "suggestion_note"            text,
  -- Bumped whenever the suggestion's content changes, so a learner who
  -- dismissed an earlier draft still sees an improved one.
  "suggestion_version"         integer NOT NULL DEFAULT 0,
  -- The only user id in this table, and it is an editor — never the author.
  "reviewed_by"                uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at"                timestamp,

  -- Informational only ("last seen" in the admin UI). Rows are NEVER deleted
  -- by this timestamp: a scan runs with a limit, so most live rows have a stale
  -- one at any moment. Purge checks for a live source instead.
  "last_seen_at"               timestamp NOT NULL DEFAULT now(),
  "created_at"                 timestamp NOT NULL DEFAULT now(),
  "updated_at"                 timestamp NOT NULL DEFAULT now(),

  CONSTRAINT "content_quality_reviews_verdict_check"
    CHECK ("verdict" IN ('unreviewed', 'ok', 'suspect', 'suggested')),
  CONSTRAINT "content_quality_reviews_llm_score_check"
    CHECK ("llm_score" IS NULL OR ("llm_score" >= 0 AND "llm_score" <= 100)),
  CONSTRAINT "content_quality_reviews_suggestion_note_length_check"
    CHECK ("suggestion_note" IS NULL OR char_length("suggestion_note") <= 1000)
);

CREATE INDEX IF NOT EXISTS "content_quality_reviews_verdict_idx"
  ON "content_quality_reviews" ("verdict");
CREATE INDEX IF NOT EXISTS "content_quality_reviews_llm_score_idx"
  ON "content_quality_reviews" ("llm_score");

-- A learner declining a specific suggestion version. The FK cascade keeps
-- purge from leaving orphans behind.
CREATE TABLE IF NOT EXISTS "content_quality_dismissals" (
  "user_id"            uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "pool_key"           text NOT NULL
                       REFERENCES "content_quality_reviews"("pool_key") ON DELETE CASCADE,
  "suggestion_version" integer NOT NULL,
  "created_at"         timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "content_quality_dismissals_pkey"
    PRIMARY KEY ("user_id", "pool_key", "suggestion_version")
);

ALTER TABLE "content_quality_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_quality_dismissals" ENABLE ROW LEVEL SECURITY;

-- No index on word_lists yet. The obvious candidate is redundant with the PK,
-- and at current table sizes the planner most likely does not need one. Decide
-- from EXPLAIN ANALYZE against real data, and if it is needed, lead with owner_id.
