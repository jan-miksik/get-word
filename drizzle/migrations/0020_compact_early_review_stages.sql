ALTER TABLE "users"
  ALTER COLUMN "memory_hook_disable_from_stage" SET DEFAULT 5;--> statement-breakpoint
UPDATE "users"
SET "memory_hook_disable_from_stage" = CASE
  WHEN "memory_hook_disable_from_stage" <= 0 THEN 5
  WHEN "memory_hook_disable_from_stage" <= 4 THEN 5
  WHEN "memory_hook_disable_from_stage" >= 10 THEN 7
  ELSE "memory_hook_disable_from_stage" - 3
END;--> statement-breakpoint
UPDATE "user_progress"
SET
  "next_due_at" = CASE
    WHEN "stage_index" BETWEEN 1 AND 4 AND "next_due_at" IS NOT NULL THEN
      COALESCE("last_known_at", "last_unknown_at", "updated_at", "created_at") + INTERVAL '5 minutes'
    ELSE "next_due_at"
  END,
  "stage_index" = CASE
    WHEN "stage_index" <= 0 THEN 0
    WHEN "stage_index" <= 4 THEN 1
    WHEN "stage_index" >= 10 THEN 7
    ELSE "stage_index" - 3
  END
WHERE "stage_index" IS NOT NULL;--> statement-breakpoint
