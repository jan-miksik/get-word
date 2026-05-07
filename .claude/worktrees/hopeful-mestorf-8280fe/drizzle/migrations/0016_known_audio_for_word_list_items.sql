ALTER TABLE "word_list_items"
  ADD COLUMN "known_audio_asset_id" uuid,
  ADD COLUMN "known_audio_status" "audio_status" DEFAULT 'none' NOT NULL;

ALTER TABLE "word_list_items"
  ADD CONSTRAINT "word_list_items_known_audio_asset_id_media_assets_id_fk"
  FOREIGN KEY ("known_audio_asset_id")
  REFERENCES "public"."media_assets"("id")
  ON DELETE set null
  ON UPDATE no action;
