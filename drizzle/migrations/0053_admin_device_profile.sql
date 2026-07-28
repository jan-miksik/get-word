-- Admin stats: store coarse device categories for platform/form-factor splits.
-- These are deliberately normalized buckets, not raw user-agent strings.
ALTER TABLE "user_devices"
  ADD COLUMN IF NOT EXISTS "platform" text;
--> statement-breakpoint

ALTER TABLE "user_devices"
  ADD COLUMN IF NOT EXISTS "form_factor" text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_devices_platform_last_seen_idx"
  ON "user_devices" ("platform", "last_seen_at")
  WHERE "platform" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_devices_form_factor_last_seen_idx"
  ON "user_devices" ("form_factor", "last_seen_at")
  WHERE "form_factor" IS NOT NULL;
