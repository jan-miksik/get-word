CREATE TYPE "public"."api_key_provider" AS ENUM('openrouter', 'elevenlabs');--> statement-breakpoint
CREATE TYPE "public"."audio_status" AS ENUM('none', 'pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('audio');--> statement-breakpoint
CREATE TYPE "public"."storage_type" AS ENUM('arweave', 'r2');--> statement-breakpoint
CREATE TYPE "public"."translation_status" AS ENUM('manual', 'pending', 'translated', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tts_provider" AS ENUM('google_tts', 'elevenlabs');--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_hash" text NOT NULL,
	"storage_type" "storage_type" NOT NULL,
	"storage_ref" text NOT NULL,
	"media_type" "media_type" DEFAULT 'audio' NOT NULL,
	"language" text NOT NULL,
	"text_reference" text NOT NULL,
	"provider" "tts_provider" NOT NULL,
	"size_bytes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "user_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "api_key_provider" NOT NULL,
	"encrypted_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_api_keys_user_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "user_list_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"subscribed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_list_subscriptions_user_list_unique" UNIQUE("user_id","list_id")
);
--> statement-breakpoint
CREATE TABLE "word_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"category_id" uuid,
	"canonical_word_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"text_known" text NOT NULL,
	"text_target" text,
	"translation_status" "translation_status" DEFAULT 'manual' NOT NULL,
	"audio_asset_id" uuid,
	"audio_status" "audio_status" DEFAULT 'none' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"language_from" text NOT NULL,
	"language_to" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_progress" ALTER COLUMN "word_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_progress" ADD COLUMN "word_list_item_id" uuid;--> statement-breakpoint
ALTER TABLE "user_progress" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_list_subscriptions" ADD CONSTRAINT "user_list_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_list_subscriptions" ADD CONSTRAINT "user_list_subscriptions_list_id_word_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."word_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_categories" ADD CONSTRAINT "word_categories_list_id_word_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."word_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_list_items" ADD CONSTRAINT "word_list_items_list_id_word_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."word_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_list_items" ADD CONSTRAINT "word_list_items_category_id_word_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."word_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_list_items" ADD CONSTRAINT "word_list_items_audio_asset_id_media_assets_id_fk" FOREIGN KEY ("audio_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_lists" ADD CONSTRAINT "word_lists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "word_list_items_list_cat_pos_idx" ON "word_list_items" USING btree ("list_id","category_id","position");--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_word_list_item_id_word_list_items_id_fk" FOREIGN KEY ("word_list_item_id") REFERENCES "public"."word_list_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_progress_user_item_idx" ON "user_progress" USING btree ("user_id","word_list_item_id");