-- App Store user-generated-content safety: report public lists, hide reported
-- content pending review, and let users block list owners.
ALTER TABLE "word_lists"
  ADD COLUMN IF NOT EXISTS "moderation_status" text DEFAULT 'visible' NOT NULL;
--> statement-breakpoint

ALTER TABLE "word_lists"
  ADD COLUMN IF NOT EXISTS "moderation_updated_at" timestamp;
--> statement-breakpoint

ALTER TABLE "word_lists"
  ADD COLUMN IF NOT EXISTS "moderation_note" text;
--> statement-breakpoint

ALTER TABLE "word_lists"
  ADD CONSTRAINT "word_lists_moderation_status_check"
  CHECK ("moderation_status" IN ('visible', 'under_review', 'rejected'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "word_lists_public_moderation_idx"
  ON "word_lists" ("is_public", "moderation_status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "blocker_id" uuid NOT NULL,
  "blocked_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_blocks_blocker_blocked_unique" UNIQUE("blocker_id", "blocked_id"),
  CONSTRAINT "user_blocks_not_self_check" CHECK ("blocker_id" <> "blocked_id")
);
--> statement-breakpoint

ALTER TABLE "user_blocks"
  ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk"
  FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "user_blocks"
  ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk"
  FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_blocks_blocker_idx" ON "user_blocks" ("blocker_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_blocks_blocked_idx" ON "user_blocks" ("blocked_id");
--> statement-breakpoint

ALTER TABLE "user_blocks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "content_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reporter_id" uuid,
  "list_id" uuid,
  "reported_owner_id" uuid,
  "reason" text NOT NULL,
  "details" text,
  "list_name_snapshot" text NOT NULL,
  "list_description_snapshot" text,
  "content_excerpt" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "moderator_note" text,
  "reviewed_by" uuid,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "content_reports_reason_check"
    CHECK ("reason" IN ('sexual_content', 'hate_or_harassment', 'violence_or_danger', 'illegal_content', 'spam_or_misleading', 'copyright', 'other')),
  CONSTRAINT "content_reports_status_check"
    CHECK ("status" IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  CONSTRAINT "content_reports_details_length_check"
    CHECK ("details" IS NULL OR char_length("details") <= 1000),
  CONSTRAINT "content_reports_excerpt_length_check"
    CHECK ("content_excerpt" IS NULL OR char_length("content_excerpt") <= 8000)
);
--> statement-breakpoint

ALTER TABLE "content_reports"
  ADD CONSTRAINT "content_reports_reporter_id_users_id_fk"
  FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "content_reports"
  ADD CONSTRAINT "content_reports_list_id_word_lists_id_fk"
  FOREIGN KEY ("list_id") REFERENCES "public"."word_lists"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "content_reports"
  ADD CONSTRAINT "content_reports_reported_owner_id_users_id_fk"
  FOREIGN KEY ("reported_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "content_reports"
  ADD CONSTRAINT "content_reports_reviewed_by_users_id_fk"
  FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "content_reports_status_created_idx"
  ON "content_reports" ("status", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "content_reports_list_idx" ON "content_reports" ("list_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "content_reports_open_reporter_list_unique"
  ON "content_reports" ("reporter_id", "list_id")
  WHERE "reporter_id" IS NOT NULL
    AND "list_id" IS NOT NULL
    AND "status" IN ('pending', 'reviewing');
--> statement-breakpoint

ALTER TABLE "content_reports" ENABLE ROW LEVEL SECURITY;
