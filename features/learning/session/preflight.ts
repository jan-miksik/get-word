import type { SessionPlan } from './plan';

/**
 * The day's new words, checked against the words there are to fill them with.
 *
 * The session clock credits studying only, so stepping out to add words in the
 * middle of a session now costs the learner the trip rather than the time. The
 * cheapest way to keep that from happening is to look at the plan before the
 * day starts: it already knows how many new words the day promised and how many
 * of them the lists could not supply.
 *
 * Deliberately the *new-word* gap and not the day's total shortfall. A day can
 * also fall short because the repeats it was sized for are not due yet, and no
 * amount of adding words closes that gap — offering it would send the learner
 * to the chat to fix something the chat cannot fix.
 */
export interface SessionPreflight {
  /** New words the day promised to introduce. */
  plannedNewWords: number;
  /** How many of them the lists can supply. */
  availableNewWords: number;
  /** The gap — how many words are worth adding first. */
  missingNewWords: number;
}

/**
 * Below this the offer is not worth the interruption it is trying to prevent:
 * a session two words short ends two words early, which nobody notices.
 */
const MIN_MISSING_WORDS = 3;

export function planSessionPreflight(input: {
  plan: SessionPlan | null;
  goalEnabled: boolean;
  /** A day with nothing due is not short of anything. */
  goalStatus: 'active' | 'nothing_due' | null;
  /** Items answered today, from the live plan rather than the server rollup. */
  answeredToday: number;
  dismissed: boolean;
}): SessionPreflight | null {
  if (input.dismissed) return null;
  if (!input.goalEnabled || input.goalStatus !== 'active') return null;
  // Only before the first answer. Once the session is under way the trip we
  // are trying to save has either already happened or is no longer avoidable,
  // and a card that appears mid-session is the interruption itself.
  if (input.answeredToday > 0) return null;

  const plan = input.plan;
  if (!plan?.enabled || plan.sessionItemCap === null) return null;
  if (typeof plan.newTarget !== 'number') return null;
  if (plan.newShortfall < MIN_MISSING_WORDS) return null;

  return {
    plannedNewWords: plan.newTarget,
    availableNewWords: Math.max(0, plan.newTarget - plan.newShortfall),
    missingNewWords: plan.newShortfall,
  };
}
