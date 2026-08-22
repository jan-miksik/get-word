export type LearningOnboardingStep =
  | 'language'
  | 'level'
  | 'goal'
  | 'reminder'
  | 'words'
  | 'loading'
  | 'app';

/**
 * The order a new learner meets the questions in: languages, how much of the
 * language they already have, the study goal, reminders, and only then the
 * words themselves. Adding words last means the chat can build on everything
 * the earlier steps established instead of guessing.
 *
 * Every step is resumable, because each one is decided from stored state rather
 * than from a position in a wizard: someone who closes the tab after the goal
 * comes back to reminders.
 */
export function resolveLearningOnboardingStep({
  forceLanguage,
  hasNoSelectedWordList,
  onboardingCompleted,
  hasLanguagePair,
  languageLevelLoaded,
  hasLanguageLevel,
  goalSummaryLoaded,
  hasActiveGoal,
  reminderOnboardingAnswered,
}: {
  forceLanguage: boolean;
  hasNoSelectedWordList: boolean;
  onboardingCompleted: boolean;
  hasLanguagePair: boolean;
  languageLevelLoaded: boolean;
  hasLanguageLevel: boolean;
  goalSummaryLoaded: boolean;
  hasActiveGoal: boolean;
  reminderOnboardingAnswered: boolean;
}): LearningOnboardingStep {
  if (forceLanguage || !onboardingCompleted || !hasLanguagePair) {
    return 'language';
  }
  // Having no list to study is what "still being set up" means. Everyone else
  // has been through these questions once and must not meet them again — the
  // goal and reminder steps stay reachable for them because those two are gated
  // on their own stored answers, not on this.
  const settingUp = hasNoSelectedWordList;
  if (settingUp && !languageLevelLoaded) return 'loading';
  if (settingUp && !hasLanguageLevel) return 'level';
  if (!goalSummaryLoaded) return settingUp ? 'loading' : 'app';
  if (!hasActiveGoal) return 'goal';
  if (!reminderOnboardingAnswered) return 'reminder';
  return settingUp ? 'words' : 'app';
}
