ALTER TABLE "word_lists" ADD COLUMN IF NOT EXISTS "is_recommended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "word_lists_recommended_idx" ON "word_lists" USING btree ("is_recommended");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "word_lists_recommended_pair_unique"
ON "word_lists" (
  (CASE WHEN lower("language_from") IN ('cz', 'cs') THEN 'cs' ELSE lower("language_from") END),
  (CASE WHEN lower("language_to") IN ('cz', 'cs') THEN 'cs' ELSE lower("language_to") END)
)
WHERE "is_recommended" = true;
