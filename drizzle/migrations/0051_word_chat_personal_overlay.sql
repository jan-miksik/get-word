-- Personal word-chat overlay and durable commit idempotency.
--
-- takeover_source_item_id is intentionally not an FK. It is a stable semantic
-- pointer ("this personal item overrides that source identity"), and must
-- survive deletion of the public/legacy source.
ALTER TABLE "word_list_items"
  ADD COLUMN IF NOT EXISTS "takeover_source_item_id" uuid;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "word_list_items_personal_takeover_unique"
  ON "word_list_items" ("list_id", "takeover_source_item_id")
  WHERE "takeover_source_item_id" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "word_chat_commits" (
  "creation_key" text PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "session_id" text NOT NULL,
  "list_id" uuid,
  "category_id" uuid,
  "item_count" integer DEFAULT 0 NOT NULL,
  "takeover_count" integer DEFAULT 0 NOT NULL,
  "upgraded_takeover_count" integer DEFAULT 0 NOT NULL,
  "committed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "word_chat_commits_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "word_chat_commits_counts_nonnegative"
    CHECK (
      "item_count" >= 0
      AND "takeover_count" >= 0
      AND "upgraded_takeover_count" >= 0
    )
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "word_chat_commits_user_created_idx"
  ON "word_chat_commits" ("user_id", "created_at");
--> statement-breakpoint

-- Backfill the old category-owned creation keys. Takeover did not exist before
-- this migration, so both takeover counters are honestly zero.
INSERT INTO "word_chat_commits" (
  "creation_key",
  "user_id",
  "session_id",
  "list_id",
  "category_id",
  "item_count",
  "takeover_count",
  "upgraded_takeover_count",
  "committed_at"
)
SELECT
  c."creation_key",
  l."owner_id",
  'legacy:' || c."creation_key",
  c."list_id",
  c."id",
  count(i."id")::integer,
  0,
  0,
  c."created_at"
FROM "word_categories" c
JOIN "word_lists" l ON l."id" = c."list_id"
LEFT JOIN "word_list_items" i ON i."category_id" = c."id"
WHERE c."creation_key" IS NOT NULL
  AND l."owner_id" IS NOT NULL
GROUP BY c."creation_key", l."owner_id", c."list_id", c."id", c."created_at"
ON CONFLICT ("creation_key") DO NOTHING;
