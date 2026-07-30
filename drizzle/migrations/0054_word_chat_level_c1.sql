-- Add C1 to the word-chat learner levels.
--
-- B2 was the ceiling, and learners at the top of the scale kept getting
-- vocabulary they already knew. C1 gives the proposal prompt a level whose
-- profile is idiomatic, register-sensitive and genuinely low-frequency.
ALTER TABLE "user_language_preferences"
  DROP CONSTRAINT IF EXISTS "user_language_preferences_language_level_check";
--> statement-breakpoint

ALTER TABLE "user_language_preferences"
  ADD CONSTRAINT "user_language_preferences_language_level_check"
  CHECK ("language_level" IN ('A0', 'A1', 'A2', 'B1', 'B2', 'C1'));
