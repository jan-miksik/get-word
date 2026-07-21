-- Per-account photo-lab allowance override, set by an operator.
-- NULL keeps whatever the account's normal path grants (editor daily bucket,
-- free weekly bucket, or the school plan's monthly quota). A number replaces
-- that limit on whichever path applies; 0 disables photo analysis entirely.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "photo_lab_limit_override" integer;

ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_photo_lab_limit_override_non_negative";

ALTER TABLE "users"
  ADD CONSTRAINT "users_photo_lab_limit_override_non_negative"
  CHECK ("photo_lab_limit_override" IS NULL OR "photo_lab_limit_override" >= 0);
