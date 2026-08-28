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

/**
 * The step to render once a still-resolving gate is taken into account.
 *
 * Every step is decided from stored answers, and some of those answers are
 * fetched — so submitting one step leaves a gap before the next one can be
 * named. Filling that gap with the boot loader made finishing a step blink the
 * whole app away and back for as long as one request took. Holding the screen
 * the learner is already looking at is the honest thing to show: they have
 * answered, nothing has moved yet.
 *
 * Only mid-flow gaps are held. With no step behind it — the first paint of a
 * session — `loading` still means the loader, because there is nothing else to
 * show yet.
 */
export function holdOnboardingStepWhileLoading(
  step: LearningOnboardingStep,
  lastRenderedStep: LearningOnboardingStep | null,
): LearningOnboardingStep {
  if (step !== 'loading') return step;
  if (!lastRenderedStep || lastRenderedStep === 'loading' || lastRenderedStep === 'app') {
    return step;
  }
  return lastRenderedStep;
}

/**
 * The order Back walks, which is the order the steps are met in. `loading` and
 * `app` are not positions in the flow, so they are absent.
 */
const ONBOARDING_STEP_ORDER = ['language', 'level', 'goal', 'reminder', 'words'] as const;

/**
 * Which step a Back press on `step` should show, given whether this is a full
 * first-time setup run.
 *
 * The level question is only ever asked during setup, so for a returning
 * learner who is only being asked for a goal, Back stops there rather than
 * offering a step they never saw. `null` means this step has no Back.
 */
export function onboardingBackTarget(
  step: LearningOnboardingStep,
  { isSettingUp }: { isSettingUp: boolean },
): LearningOnboardingStep | null {
  switch (step) {
    case 'level':
      return 'language';
    case 'goal':
      return isSettingUp ? 'level' : null;
    case 'reminder':
      return 'goal';
    case 'words':
      return 'reminder';
    default:
      return null;
  }
}

/**
 * The step to render, once a Back press is taken into account.
 *
 * Steps are resolved from stored answers, not from a cursor, which is what
 * makes the flow resumable — and what makes going back need an override: the
 * answers still say "move on". The override only ever moves the flow backwards,
 * so a step that has since been answered cannot trap anyone; callers drop it as
 * soon as a step is submitted.
 */
export function applyOnboardingBack(
  step: LearningOnboardingStep,
  back: LearningOnboardingStep | null,
): LearningOnboardingStep {
  if (!back || step === 'loading') return step;
  const stepIndex = ONBOARDING_STEP_ORDER.indexOf(step as (typeof ONBOARDING_STEP_ORDER)[number]);
  const backIndex = ONBOARDING_STEP_ORDER.indexOf(back as (typeof ONBOARDING_STEP_ORDER)[number]);
  if (backIndex < 0 || stepIndex < 0) return step;
  return backIndex < stepIndex ? back : step;
}
