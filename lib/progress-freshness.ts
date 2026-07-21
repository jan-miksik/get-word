/**
 * Freshness comparison for progress rows.
 *
 * A row's age is the moment of the last review recorded on it, not its
 * `updatedAt`: `updatedAt` is written by whichever side stored the row last
 * (server clock for event-sourced writes, client clock for LWW writes), so it
 * says when a copy was saved rather than when the user actually acted. The
 * review timestamps come from the device that performed the review and travel
 * with the row unchanged, which makes them the only value both sides agree on.
 */

function toEpochMs(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Epoch ms of the last review on a progress row. Accepts both the wire shape
 * (ISO strings) and the in-state shape (epoch numbers).
 *
 * Returns 0 for a row the user has never acted on, which makes it lose every
 * comparison — an untouched local row must never win over the server's copy.
 */
export function progressActivityAt(
  entry:
    | {
        lastKnownAt?: string | number | null;
        lastUnknownAt?: string | number | null;
      }
    | null
    | undefined
): number {
  if (!entry) return 0;
  return Math.max(toEpochMs(entry.lastKnownAt), toEpochMs(entry.lastUnknownAt));
}
