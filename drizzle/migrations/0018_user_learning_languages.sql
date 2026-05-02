ALTER TABLE "users"
  ADD COLUMN "language_from" text,
  ADD COLUMN "language_to" text,
  ADD COLUMN "onboarding_completed_at" timestamp;
