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
/**
 * Whether the goal question has been answered, from the goal state as the
 * server reports it.
 *
 * A stored version is the answer, whatever it says. Reading `active.enabled`
 * instead conflates "never asked" with "asked, and said no": a learner who
 * switches the goal off in Settings would be shown the setup card again on the
 * next open, which makes the switch impossible to keep off.
 */
export function hasConfiguredGoal(goal: {
  active: unknown | null;
  pending: unknown | null;
} | null | undefined): boolean {
  return Boolean(goal?.active || goal?.pending);
}

export function resolveLearningOnboardingStep({
  forceLanguage,
  hasNoSelectedWordList,
  onboardingCompleted,
  hasLanguagePair,
  languageLevelLoaded,
  hasLanguageLevel,
  goalSummaryLoaded,
  hasConfiguredGoal,
  reminderOnboardingAnswered,
}: {
  forceLanguage: boolean;
  hasNoSelectedWordList: boolean;
  onboardingCompleted: boolean;
  hasLanguagePair: boolean;
  languageLevelLoaded: boolean;
  hasLanguageLevel: boolean;
  goalSummaryLoaded: boolean;
  /**
   * Whether the learner has ever answered the goal question — a stored goal
   * version, enabled or not. Deliberately not "a goal is running": turning the
   * goal off in Settings is a supported way to use the app, and asking again on
   * the next open would make that switch impossible to keep flipped off.
   */
  hasConfiguredGoal: boolean;
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
  if (!hasConfiguredGoal) return 'goal';
  if (!reminderOnboardingAnswered) return 'reminder';
  return settingUp ? 'words' : 'app';
}
