-- Indexes for the per-school usage dashboard.
DROP INDEX IF EXISTS "school_memberships_active_school_role_idx";
--> statement-breakpoint
CREATE INDEX "school_memberships_active_school_role_idx" ON "school_memberships" USING btree ("school_id","role","claimed_at") WHERE "school_memberships"."revoked_at" is null;
--> statement-breakpoint
CREATE INDEX "school_translation_requests_school_created_idx" ON "school_translation_requests" USING btree ("school_id","created_at");
