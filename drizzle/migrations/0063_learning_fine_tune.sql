-- Per-stage learning configuration: which methods run at each spaced-repetition
-- stage, their weights, and the variants they may use.
--
-- Nullable on purpose: NULL means the learner has never opened the settings, and
-- the client fills in the default preset. That keeps the server from having to
-- version a default that will keep changing.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "learning_fine_tune" jsonb;
