ALTER TABLE "user_api_keys"
  ADD COLUMN "key_label" text,
  ADD COLUMN "status" text DEFAULT 'connected' NOT NULL,
  ADD COLUMN "last_validated_at" timestamp,
  ADD COLUMN "connected_at" timestamp DEFAULT now() NOT NULL,
  ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL,
  ADD COLUMN "key_last4" text,
  ADD COLUMN "connection_method" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint

UPDATE "user_api_keys"
SET
  "connected_at" = COALESCE("connected_at", "created_at"),
  "updated_at" = COALESCE("updated_at", now()),
  "key_last4" = CASE
    WHEN "key_last4" IS NOT NULL THEN "key_last4"
    WHEN length("encrypted_key") >= 4 THEN right("encrypted_key", 4)
    ELSE NULL
  END;--> statement-breakpoint

CREATE TABLE "oauth_rate_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bucket_key" text NOT NULL,
  "bucket_start" timestamp NOT NULL,
  "request_count" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "oauth_rate_limits_bucket_unique" UNIQUE("bucket_key","bucket_start")
);--> statement-breakpoint

CREATE INDEX "oauth_rate_limits_bucket_key_idx"
  ON "oauth_rate_limits" USING btree ("bucket_key","bucket_start");
