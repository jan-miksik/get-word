-- Persist the rest of the first word-chat setup so learners are not asked
-- again on another device or after clearing a draft.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "word_chat_salutation_gender" text,
  ADD COLUMN IF NOT EXISTS "word_chat_language_level" text;
--> statement-breakpoint

ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_word_chat_salutation_gender_check";
--> statement-breakpoint

ALTER TABLE "users"
  ADD CONSTRAINT "users_word_chat_salutation_gender_check"
  CHECK (
    "word_chat_salutation_gender" IS NULL
    OR "word_chat_salutation_gender" IN ('female', 'male', 'neutral')
  );
--> statement-breakpoint

ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_word_chat_language_level_check";
--> statement-breakpoint

ALTER TABLE "users"
  ADD CONSTRAINT "users_word_chat_language_level_check"
  CHECK (
    "word_chat_language_level" IS NULL
    OR "word_chat_language_level" IN ('A0', 'A1', 'A2', 'B1', 'B2')
  );
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_language_preferences" (
  "user_id" uuid NOT NULL,
  "language_to" text NOT NULL,
  "language_level" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_language_preferences_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "user_language_preferences_user_language_unique"
    UNIQUE ("user_id", "language_to"),
  CONSTRAINT "user_language_preferences_language_level_check"
    CHECK ("language_level" IN ('A0', 'A1', 'A2', 'B1', 'B2'))
);
--> statement-breakpoint

INSERT INTO "user_language_preferences" (
  "user_id",
  "language_to",
  "language_level",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  CASE
    WHEN lower(split_part(trim("language_to"), '-', 1)) IN ('cs', 'cz') THEN 'cs'
    WHEN position('-' in trim("language_to")) > 0 THEN
      lower(split_part(trim("language_to"), '-', 1)) || '-' ||
      CASE
        WHEN length(split_part(trim("language_to"), '-', 2)) = 4 THEN
          upper(left(split_part(trim("language_to"), '-', 2), 1)) ||
          lower(substr(split_part(trim("language_to"), '-', 2), 2))
        ELSE upper(split_part(trim("language_to"), '-', 2))
      END
    ELSE lower(trim("language_to"))
  END,
  "word_chat_language_level",
  now(),
  now()
FROM "users"
WHERE "language_to" IS NOT NULL
  AND trim("language_to") <> ''
  AND "word_chat_language_level" IN ('A0', 'A1', 'A2', 'B1', 'B2')
ON CONFLICT ("user_id", "language_to") DO NOTHING;
--> statement-breakpoint

-- Language level is scoped to the target language. The users column existed in
-- an earlier draft of this migration only as a backfill source.
ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_word_chat_language_level_check",
  DROP COLUMN IF EXISTS "word_chat_language_level";
