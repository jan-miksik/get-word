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
