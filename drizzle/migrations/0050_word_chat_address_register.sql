-- Keep the learner's tykání/vykání choice across word-chat sessions.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "word_chat_address_register" text;
--> statement-breakpoint

ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_word_chat_address_register_check";
--> statement-breakpoint

ALTER TABLE "users"
  ADD CONSTRAINT "users_word_chat_address_register_check"
  CHECK (
    "word_chat_address_register" IS NULL
    OR "word_chat_address_register" IN ('casual', 'formal')
  );
