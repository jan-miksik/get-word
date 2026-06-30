CREATE TYPE "public"."storage_provider" AS ENUM('b2');--> statement-breakpoint
ALTER TYPE "public"."storage_type" ADD VALUE 'object_store';--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "storage_provider" "storage_provider";