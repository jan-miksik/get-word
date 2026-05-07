ALTER TABLE "users"
  ADD COLUMN "memory_hooks_enabled" boolean DEFAULT true NOT NULL,
  ADD COLUMN "memory_hook_disable_from_stage" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
