import type { SessionPlan } from './plan';

/**
 * The day's size, checked against the words there are to fill it with.
 *
 * The session clock credits studying only, so stepping out to add words in the
 * middle of a session now costs the learner the trip rather than the time. The
 * cheapest way to keep that from happening is to look at the plan before the
 * day starts: it already knows how many items the budget was sized for and how
 * many of them the lists could not supply.
 */
export interface SessionPreflight {
  /** Items the day was planned to cost. */
  plannedItems: number;
  /** How many of them exist to be studied. */
  availableItems: number;
  /** The gap — roughly how many words are worth adding first. */
  missingItems: number;
}

/**
 * Below this the offer is not worth the interruption it is trying to prevent:
 * a session two cards short ends two cards early, which nobody notices.
 */
const MIN_MISSING_ITEMS = 3;

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
  if (plan.shortfall < MIN_MISSING_ITEMS) return null;

  return {
    plannedItems: plan.sessionItemCap,
    availableItems: Math.max(0, plan.sessionItemCap - plan.shortfall),
    missingItems: plan.shortfall,
  };
}
