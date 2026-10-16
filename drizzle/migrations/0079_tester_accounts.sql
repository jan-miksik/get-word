-- Store-review and QA accounts the admin dashboard filters out. Previously a
-- checked-in list in lib/db/queries/tester-accounts.ts; these are real personal
-- email addresses, so they belong in the database and not in the repository.
-- The rows themselves are seeded separately, outside version control.
CREATE TABLE IF NOT EXISTS "tester_accounts" (
  "email" text PRIMARY KEY NOT NULL,
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "tester_accounts_email_lowercase" CHECK ("email" = lower("email"))
);
--> statement-breakpoint
ALTER TABLE "tester_accounts" ENABLE ROW LEVEL SECURITY;
