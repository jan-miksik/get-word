-- The words goal was capped at 30 a day, which was the dial's range mistaken
-- for a limit. The dial still stops at 30; a deliberately typed number may now
-- go up to 1000, and the picker shows what that costs in time rather than
-- refusing it. Existing rows all satisfy the wider constraint.
ALTER TABLE "user_study_goal_versions"
  DROP CONSTRAINT IF EXISTS "user_study_goal_versions_mode_check";
ALTER TABLE "user_study_goal_versions"
  ADD CONSTRAINT "user_study_goal_versions_mode_check" CHECK (
    ("goal_mode" = 'minutes' AND "goal_minutes_per_day" IS NOT NULL AND "goal_new_words_per_day" IS NULL)
    OR ("goal_mode" = 'words' AND "goal_new_words_per_day" BETWEEN 1 AND 1000 AND "goal_minutes_per_day" IS NULL)
  );
