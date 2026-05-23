-- Rename the legacy 'cz' / 'vi' learning role values to the pair-agnostic
-- 'knownLanguage' / 'languageToLearn' shape. The DB column type stays `text`
-- (no schema change), and the column default flips from 'vi' to
-- 'languageToLearn' to match.
--
-- Mapping:
--   'cz' (= user knows the list's `languageFrom` side) → 'knownLanguage'
--   'vi' (= user knows the list's `languageTo`   side) → 'languageToLearn'
--
-- The API route normalizes both shapes on inbound writes (see
-- app/api/sync/route.ts), so any rows written by older clients during the
-- rollout are converted on next sync. This migration handles the existing
-- bulk of rows in one pass.

UPDATE "users"
SET "role" = 'knownLanguage'
WHERE "role" = 'cz';

UPDATE "users"
SET "role" = 'languageToLearn'
WHERE "role" = 'vi';

ALTER TABLE "users"
  ALTER COLUMN "role" SET DEFAULT 'languageToLearn';
