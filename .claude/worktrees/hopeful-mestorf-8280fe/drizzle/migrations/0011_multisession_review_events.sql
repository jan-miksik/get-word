CREATE TYPE "public"."review_action" AS ENUM('known', 'really_known', 'unknown');--> statement-breakpoint
CREATE TABLE "user_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "device_id" text NOT NULL,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_devices_user_device_unique" UNIQUE("user_id","device_id")
);--> statement-breakpoint
CREATE TABLE "review_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "client_event_id" text NOT NULL,
  "device_id" text,
  "session_id" text,
  "word_id" text,
  "word_list_item_id" uuid,
  "action" "review_action" NOT NULL,
  "client_created_at" timestamp NOT NULL,
  "server_created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "review_events_user_client_event_unique" UNIQUE("user_id","client_event_id")
);--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_word_list_item_id_word_list_items_id_fk" FOREIGN KEY ("word_list_item_id") REFERENCES "public"."word_list_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_events_user_server_created_idx" ON "review_events" USING btree ("user_id","server_created_at");--> statement-breakpoint
