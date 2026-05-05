ALTER TABLE "word_lists" ADD COLUMN IF NOT EXISTS "is_common" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "word_lists"
SET "is_common" = true
WHERE "id" = (
  SELECT "id"
  FROM "word_lists"
  WHERE "owner_id" IS NULL AND "is_public" = true
  ORDER BY "created_at" ASC
  LIMIT 1
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "word_lists_common_idx" ON "word_lists" USING btree ("is_common");
