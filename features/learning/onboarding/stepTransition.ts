/**
 * Which way the flow just moved, so a step can enter from the side it came
 * from instead of simply appearing.
 *
 * Every step renders its own `OnboardingScreen`, so moving between steps
 * unmounts one screen and mounts another — the incoming screen has no way to
 * ask React what was on the screen a moment ago. This module remembers, at
 * module scope, which step was last rendered: the freshly mounted screen reads
 * it once and knows whether the learner pressed on or pressed Back.
 */
import type { OnboardingProgressStep } from './OnboardingProgress';

export type OnboardingStepDirection = 'forward' | 'back' | 'none';

/**
 * The order the steps are met in — the same order the progress rail draws.
 * Kept here rather than imported so the animation cannot break the rail (or
 * vice versa); direction only needs a relative position, and an unknown step
 * degrades to a plain fade rather than to a wrong-way slide.
 */
const STEP_ORDER: readonly OnboardingProgressStep[] = [
  'language',
  'level',
  'goal',
  'reminder',
  'words',
];

let lastStep: OnboardingProgressStep | null = null;
let lastDirection: OnboardingStepDirection = 'none';

/**
 * Records `step` as the one on screen and reports how the flow got there.
 *
 * Idempotent per step: asking twice for the same step gives the same answer,
 * which is what keeps a double render (StrictMode, a re-render mid-animation)
 * from turning a forward move into "no direction".
 */
export function trackOnboardingStep(
  step: OnboardingProgressStep | null,
): OnboardingStepDirection {
  if (!step) return 'none';
  if (lastStep === step) return lastDirection;

  const from = lastStep === null ? -1 : STEP_ORDER.indexOf(lastStep);
  const to = STEP_ORDER.indexOf(step);
  // The first step of a session has nothing behind it, and a step outside the
  // rail has no position to compare — both mean "just fade in".
  lastDirection = from < 0 || to < 0 ? 'none' : to > from ? 'forward' : 'back';
  lastStep = step;
  return lastDirection;
}

/** Test seam: forget the step on screen, as if the flow had not started. */
export function resetOnboardingStepTracking() {
  lastStep = null;
  lastDirection = 'none';
}

/** The class that plays the entrance for a move in this direction. */
export function onboardingStepEnterClass(direction: OnboardingStepDirection): string {
  if (direction === 'forward') return 'onboarding-step-enter-forward';
  if (direction === 'back') return 'onboarding-step-enter-back';
  return 'onboarding-step-enter-plain';
}
