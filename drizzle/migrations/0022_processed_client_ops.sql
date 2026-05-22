CREATE TABLE IF NOT EXISTS "processed_client_ops" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "device_id" text,
  "client_op_id" text NOT NULL,
  "entity" text NOT NULL,
  "client_created_at" timestamp,
  "processed_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "processed_client_ops_user_op_unique" UNIQUE ("user_id","client_op_id")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "processed_client_ops" ADD CONSTRAINT "processed_client_ops_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processed_client_ops_processed_at_idx" ON "processed_client_ops" USING btree ("processed_at");
