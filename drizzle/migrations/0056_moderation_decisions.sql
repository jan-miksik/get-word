-- User-visible outcomes for reports and statements of reasons for list owners.
-- Internal moderator notes remain separate and are never serialized to clients.
ALTER TABLE "word_lists"
  ADD COLUMN IF NOT EXISTS "moderation_decision_code" text;
--> statement-breakpoint

ALTER TABLE "word_lists"
  ADD COLUMN IF NOT EXISTS "moderation_public_note" text;
--> statement-breakpoint

ALTER TABLE "word_lists"
  ADD CONSTRAINT "word_lists_moderation_decision_check"
  CHECK (
    "moderation_decision_code" IS NULL OR
    "moderation_decision_code" IN (
      'sexual_content', 'hate_or_harassment', 'violence_or_danger',
      'illegal_content', 'spam_or_misleading', 'copyright',
      'other_policy_violation'
    )
  );
--> statement-breakpoint

ALTER TABLE "word_lists"
  ADD CONSTRAINT "word_lists_moderation_public_note_length_check"
  CHECK ("moderation_public_note" IS NULL OR char_length("moderation_public_note") <= 1000);
--> statement-breakpoint

ALTER TABLE "content_reports"
  ADD COLUMN IF NOT EXISTS "decision_code" text;
--> statement-breakpoint

ALTER TABLE "content_reports"
  ADD COLUMN IF NOT EXISTS "public_note" text;
--> statement-breakpoint

ALTER TABLE "content_reports"
  ADD CONSTRAINT "content_reports_decision_check"
  CHECK (
    "decision_code" IS NULL OR
    "decision_code" IN (
      'no_violation', 'sexual_content', 'hate_or_harassment',
      'violence_or_danger', 'illegal_content', 'spam_or_misleading',
      'copyright', 'other_policy_violation'
    )
  );
--> statement-breakpoint

ALTER TABLE "content_reports"
  ADD CONSTRAINT "content_reports_public_note_length_check"
  CHECK ("public_note" IS NULL OR char_length("public_note") <= 1000);
