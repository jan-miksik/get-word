-- Word chat: personal lists, idempotent commits, pinned study priority, and
-- model-spend logging.
--
-- A learner's own word-chat list is `is_personal`. Public personal lists MUST be
-- excluded from every "all public lists" query path, or one learner's list shows
-- up in everybody else's sidebar and onboarding matcher.
ALTER TABLE "word_lists"
  ADD COLUMN IF NOT EXISTS "is_personal" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- Second, separate consent from `is_public`: the list stays private, but its
-- items may be shown to editors without the owner, the list name, or the
-- learner's own category name so translation mistakes can be caught.
ALTER TABLE "word_lists"
  ADD COLUMN IF NOT EXISTS "review_opt_in" boolean DEFAULT true NOT NULL;
--> statement-breakpoint

-- Structured memory of what the learner told the chat (lib/learner-brief.ts).
-- Bounded schema on purpose: never a free-text summary, never a transcript.
ALTER TABLE "word_lists"
  ADD COLUMN IF NOT EXISTS "learner_brief" jsonb;
--> statement-breakpoint

-- Exactly one personal list per owner per direction. This is what makes the
-- find-or-create inside the commit transaction safe against two open tabs.
CREATE UNIQUE INDEX IF NOT EXISTS "word_lists_personal_pair_unique"
  ON "word_lists" ("owner_id", "language_from", "language_to")
  WHERE "is_personal" = true;
--> statement-breakpoint

-- Client-generated idempotency key for one word-chat commit. The unique index is
-- what turns a double-click, a reload, or a retry into one category and one
-- quota charge instead of two. NULL for every category created any other way.
ALTER TABLE "word_categories"
  ADD COLUMN IF NOT EXISTS "creation_key" text;
--> statement-breakpoint

ALTER TABLE "word_categories"
  ADD COLUMN IF NOT EXISTS "review_label" text;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "word_categories_creation_key_unique"
  ON "word_categories" ("creation_key")
  WHERE "creation_key" IS NOT NULL;
--> statement-breakpoint

-- Categories whose items lead the study stream, ahead even of due repeats.
-- Category IDs, not names: names are editable, repeatable across lists, and
-- locale-dependent. `users.category_order` stays name-based and untouched.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "pinned_category_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."word_chat_call_type" AS ENUM('chat', 'proposal', 'translation', 'brief');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."word_chat_stage" AS ENUM('started', 'proposal_completed', 'review_completed', 'committed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- One row per model call. Real cost per session cannot be estimated at a desk —
-- a proposal call carries a corpus pool, an exclusion list and the conversation.
-- Never stores prompt or completion text. ON DELETE CASCADE so GDPR erasure
-- removes the trace with the user.
CREATE TABLE IF NOT EXISTS "word_chat_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "session_id" text NOT NULL,
  "call_type" "word_chat_call_type" NOT NULL,
  "stage" "word_chat_stage" DEFAULT 'started' NOT NULL,
  "model" text NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "estimated_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
  "item_count" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "word_chat_usage_tokens_nonnegative"
    CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0)
);
--> statement-breakpoint

ALTER TABLE "word_chat_usage"
  DROP CONSTRAINT IF EXISTS "word_chat_usage_user_id_users_id_fk";
--> statement-breakpoint

ALTER TABLE "word_chat_usage"
  ADD CONSTRAINT "word_chat_usage_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "word_chat_usage_user_created_idx"
  ON "word_chat_usage" ("user_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "word_chat_usage_session_idx"
  ON "word_chat_usage" ("session_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "word_chat_usage_created_idx"
  ON "word_chat_usage" ("created_at");
