CREATE TYPE "school_plan" AS ENUM ('pilot_v1');
--> statement-breakpoint
CREATE TYPE "school_status" AS ENUM ('active', 'inactive');
--> statement-breakpoint
CREATE TYPE "school_role" AS ENUM ('student', 'teacher');
--> statement-breakpoint
CREATE TYPE "school_feature" AS ENUM ('ai_translation');
--> statement-breakpoint
CREATE TYPE "school_translation_request_status" AS ENUM ('reserved', 'completed', 'released', 'unknown', 'failed_charged');
--> statement-breakpoint
CREATE TABLE "schools" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "plan" "school_plan" DEFAULT 'pilot_v1' NOT NULL,
  "status" "school_status" DEFAULT 'active' NOT NULL,
  "student_seat_limit" integer DEFAULT 30 NOT NULL,
  "teacher_limit" integer DEFAULT 5 NOT NULL,
  "pilot_expires_at" timestamp,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "schools_student_seat_limit_nonnegative" CHECK ("student_seat_limit" >= 0),
  CONSTRAINT "schools_teacher_limit_nonnegative" CHECK ("teacher_limit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "school_access_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "code_hash" text NOT NULL,
  "role" "school_role" NOT NULL,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "created_by" uuid,
  "revoked_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "school_access_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "school_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" "school_role" NOT NULL,
  "claimed_at" timestamp DEFAULT now() NOT NULL,
  "revoked_at" timestamp,
  "revoked_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_feature_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "school_id" uuid,
  "feature" "school_feature" NOT NULL,
  "period_start" timestamp NOT NULL,
  "used" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "school_feature_usage_used_nonnegative" CHECK ("used" >= 0),
  CONSTRAINT "school_feature_usage_user_feature_period_unique" UNIQUE("user_id","feature","period_start")
);
--> statement-breakpoint
CREATE TABLE "school_translation_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "school_id" uuid,
  "period_start" timestamp NOT NULL,
  "request_id" text NOT NULL,
  "request_hash" text NOT NULL,
  "status" "school_translation_request_status" DEFAULT 'reserved' NOT NULL,
  "item_count" integer NOT NULL,
  "character_count" integer NOT NULL,
  "model" text NOT NULL,
  "provider_generation_id" text,
  "provider_usage" jsonb,
  "result_json" jsonb,
  "error_json" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  CONSTRAINT "school_translation_requests_user_request_unique" UNIQUE("user_id","request_id"),
  CONSTRAINT "school_translation_requests_item_count_nonnegative" CHECK ("item_count" >= 0),
  CONSTRAINT "school_translation_requests_character_count_nonnegative" CHECK ("character_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_access_codes" ADD CONSTRAINT "school_access_codes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_access_codes" ADD CONSTRAINT "school_access_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_access_codes" ADD CONSTRAINT "school_access_codes_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_feature_usage" ADD CONSTRAINT "school_feature_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_feature_usage" ADD CONSTRAINT "school_feature_usage_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_translation_requests" ADD CONSTRAINT "school_translation_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_translation_requests" ADD CONSTRAINT "school_translation_requests_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "schools_status_idx" ON "schools" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "school_access_codes_school_role_idx" ON "school_access_codes" USING btree ("school_id","role");
--> statement-breakpoint
CREATE UNIQUE INDEX "school_memberships_one_active_user_unique" ON "school_memberships" USING btree ("user_id") WHERE "school_memberships"."revoked_at" is null;
--> statement-breakpoint
CREATE INDEX "school_memberships_active_school_role_idx" ON "school_memberships" USING btree ("school_id","role") WHERE "school_memberships"."revoked_at" is null;
--> statement-breakpoint
CREATE INDEX "school_feature_usage_school_period_idx" ON "school_feature_usage" USING btree ("school_id","period_start");
--> statement-breakpoint
CREATE INDEX "school_translation_requests_user_created_idx" ON "school_translation_requests" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "school_translation_requests_status_created_idx" ON "school_translation_requests" USING btree ("status","created_at");
