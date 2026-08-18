import {
  MAX_SEGMENT_MS,
  isActivitySurface,
} from '@/packages/contracts/src/activity';

/**
 * Validation and clamping policy for incoming activity segments, kept free of
 * database access so it can be exercised directly.
 *
 * The client is untrusted: a device with a wrong clock, a stale build, or a
 * modified one must not be able to inflate anyone's measured time. Per-row
 * clamps here are hard invariants. The per-day ceiling in
 * `lib/db/queries/activity-segments.ts` is deliberately only a sanity check.
 */

export interface IncomingActivitySegment {
  client_segment_id: string;
  session_id: string;
  surface: string;
  started_at: number;
  ended_at: number;
  active_ms: number;
  interactions?: number;
}

export interface NormalizedSegment {
  clientSegmentId: string;
  sessionId: string;
  surface: string;
  startedAt: Date;
  endedAt: Date;
  activeMs: number;
  interactions: number;
}

/** Segments older than this are refused outright rather than clamped. */
const MAX_BACKDATE_MS = 30 * 24 * 60 * 60 * 1000;
/** Tolerance for a device clock that runs slightly fast. */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_INTERACTIONS = 100_000;

/**
 * Best-effort ceiling on a single user-day. Not an invariant: two devices
 * syncing concurrently can each read "10 h so far" and each accept another 5 h,
 * because the check and the insert are not serialized. Making it exact would
 * need a per-user advisory lock, which is not worth it while this number is
 * only read by the admin dashboard.
 */
export const DAILY_ACTIVE_CEILING_MS = 16 * 60 * 60 * 1000;

/** Returns null when the segment cannot be salvaged. */
export function normalizeActivitySegment(
  segment: IncomingActivitySegment,
  now = Date.now(),
): NormalizedSegment | null {
  const clientSegmentId = String(segment.client_segment_id ?? '').trim();
  const sessionId = String(segment.session_id ?? '').trim();
  if (!clientSegmentId || !sessionId) return null;

  const startedAt = Number(segment.started_at);
  const endedAt = Number(segment.ended_at);
  const activeMs = Number(segment.active_ms);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return null;
  if (!Number.isFinite(activeMs) || activeMs < 0) return null;

  if (endedAt <= startedAt) return null;
  if (endedAt > now + MAX_FUTURE_SKEW_MS) return null;
  if (startedAt < now - MAX_BACKDATE_MS) return null;

  // The span is the source of truth for a later cross-device interval union,
  // so credited time may never exceed it.
  const span = endedAt - startedAt;
  const clamped = Math.min(activeMs, span, MAX_SEGMENT_MS);
  if (clamped <= 0) return null;

  const interactions = Number(segment.interactions ?? 0);

  return {
    clientSegmentId,
    sessionId,
    // Unknown surfaces are already folded to 'other' by the transport schema;
    // re-check here so a direct caller cannot bypass it.
    surface: isActivitySurface(segment.surface) ? segment.surface : 'other',
    startedAt: new Date(startedAt),
    endedAt: new Date(endedAt),
    activeMs: clamped,
    interactions:
      Number.isFinite(interactions) && interactions > 0
        ? Math.min(Math.floor(interactions), MAX_INTERACTIONS)
        : 0,
  };
}

/** UTC day key used to budget a batch that spans midnight against each day. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
