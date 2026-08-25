/**
 * Wire vocabulary for activity segments, kept dependency-free so both the
 * runtime contract (`./sync`) and the framework-neutral tracker
 * (`packages/product/shared/activity/tracker`) can share it without either
 * depending on the other.
 *
 * Behavioural constants that only the tracker cares about (idle horizon, tick
 * resolution, session gap) live with the tracker. Only values the server also
 * has to agree on belong here.
 */

export const ACTIVITY_SURFACES = [
  'study',
  'lists',
  'photo_lab',
  'word_chat',
  'school',
  'admin',
  'onboarding',
  'other',
] as const;

export type ActivitySurface = (typeof ACTIVITY_SURFACES)[number];

/**
 * The surfaces whose measured time counts towards a study goal.
 *
 * Only studying. Adding words, photographing a menu and browsing lists are all
 * work on the app, but a session goal is a promise about time spent learning,
 * and a clock that ran while words were being typed in would let the day be
 * earned without a single answer. Everything else is still measured — it is
 * simply not what the goal is about.
 *
 * Both the day rollup (`getLocalDayActivity`) and the clock the learner watches
 * (`lib/activity/runtime`) read this one list: a countdown that credited a
 * surface the day total ignores would run down against a server that disagreed
 * and never caught up.
 */
export const GOAL_CREDITED_SURFACES = ['study'] as const;

export function isGoalCreditedSurface(surface: ActivitySurface): boolean {
  return (GOAL_CREDITED_SURFACES as readonly string[]).includes(surface);
}

/**
 * Upper bound on a single segment. The tracker force-closes at this length, and
 * the server clamps to it, so neither a stalled client nor a modified build can
 * post an unbounded duration.
 */
export const MAX_SEGMENT_MS = 15 * 60_000;

export function isActivitySurface(value: unknown): value is ActivitySurface {
  return (
    typeof value === 'string' &&
    (ACTIVITY_SURFACES as readonly string[]).includes(value)
  );
}
