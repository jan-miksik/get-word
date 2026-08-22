/**
 * Framework-neutral accumulator for "time actually spent in the app".
 *
 * The number this replaces was inferred from gaps between review-event sync
 * timestamps, which measured how often the outbox flushed rather than how long
 * anyone studied. This measures directly instead: it accrues wall-clock time
 * only while the app is active and the user has interacted recently, and emits
 * closed segments that a server can sum.
 *
 * Browser and native lifecycle wiring lives in adapters (`lib/activity/runtime`),
 * exactly as `SyncEngine` keeps DOM concerns out of `packages/product/shared/sync`.
 * Nothing here touches `document`, `window` or `localStorage`, so the whole
 * state machine is testable against a fake clock.
 */

import {
  MAX_SEGMENT_MS,
  type ActivitySurface,
} from '@/packages/contracts/src/activity';

export { MAX_SEGMENT_MS };

export const IDLE_TIMEOUT_MS = 60_000;
export const TICK_MS = 5_000;
export const SESSION_GAP_MS = 30 * 60_000;
export const CLOCK_SLIP_TOLERANCE_MS = 5_000;

/**
 * Why a segment ended. Only `max_segment` and `day_rollover` continue straight
 * into a successor segment; the rest wait for the next credited activity.
 */
type SegmentCloseReason =
  | 'idle'
  | 'inactive'
  | 'surface_change'
  | 'owner_change'
  | 'clock_slip'
  | 'max_segment'
  | 'day_rollover'
  | 'shutdown';

export interface ActivitySegment {
  client_segment_id: string;
  session_id: string;
  surface: ActivitySurface;
  /** Wall-clock ms at the first credited moment of this segment. */
  started_at: number;
  /** Wall-clock ms at the last credited moment. */
  ended_at: number;
  active_ms: number;
  interactions: number;
}

/**
 * Everything needed to resume an interrupted segment after a reload or crash.
 * `owner` is carried so a checkpoint written by one account is never recovered
 * under another, and `checkpointed_at` exists so recovery can prove how stale
 * the record is without consulting the boot clock.
 */
export interface ActivityCheckpoint {
  owner: string | null;
  session_id: string;
  client_segment_id: string;
  surface: ActivitySurface;
  started_at: number;
  /** Wall-clock ms through which time has actually been credited. */
  last_accounted_wall: number;
  active_ms: number;
  interactions: number;
  last_interaction_wall: number;
  checkpointed_at: number;
}

export interface ActivityTrackerPorts {
  /** Monotonic source (`performance.now()`); immune to wall-clock steps. */
  monotonicNow(): number;
  /** Wall clock (`Date.now()`); what segments are timestamped with. */
  wallNow(): number;
  emit(segment: ActivitySegment): void;
  /** Called with the open segment, or null once nothing is in flight. */
  checkpoint(state: ActivityCheckpoint | null): void;
  createId(): string;
}

export interface ActivityTracker {
  setActive(active: boolean): void;
  setSurface(surface: ActivitySurface): void;
  setOwner(owner: string | null): void;
  noteInteraction(): void;
  tick(): void;
  close(reason?: SegmentCloseReason): void;
  restore(checkpoint: ActivityCheckpoint): void;
  /** Test/diagnostic view. Never persisted directly. */
  peek(): {
    open: boolean;
    accruing: boolean;
    sessionId: string | null;
    activeMs: number;
    /**
     * Time since the last `settle()` that the next one will credit. Display
     * only: it is deliberately not part of `activeMs`, which stays the
     * accounted figure a checkpoint or a segment may be built from.
     */
    uncreditedMs: number;
    surface: ActivitySurface;
  };
}

interface OpenSegment {
  clientSegmentId: string;
  sessionId: string;
  surface: ActivitySurface;
  startedAt: number;
  activeMs: number;
  interactions: number;
}

function utcDayIndex(wallMs: number): number {
  return Math.floor(wallMs / 86_400_000);
}

/**
 * Rounds a segment onto integer milliseconds for the wire.
 *
 * Accrual is fractional because it comes from `performance.now()` deltas, but
 * the transport contract requires an integer `active_ms`. Rounding happens once,
 * here, rather than during accrual — rounding every tick would compound a bias
 * over a long session.
 *
 * The span is rounded first and `active_ms` clamped to it afterwards, because
 * rounding the two independently can otherwise push credited time a millisecond
 * past its own interval and break the invariant the whole design rests on.
 */
function finalizeSegment(segment: {
  client_segment_id: string;
  session_id: string;
  surface: ActivitySurface;
  started_at: number;
  ended_at: number;
  active_ms: number;
  interactions: number;
}): ActivitySegment {
  const startedAt = Math.round(segment.started_at);
  const endedAt = Math.max(startedAt, Math.round(segment.ended_at));
  return {
    ...segment,
    started_at: startedAt,
    ended_at: endedAt,
    active_ms: Math.min(Math.round(segment.active_ms), endedAt - startedAt),
    interactions: Math.round(segment.interactions),
  };
}

export function createActivityTracker(ports: ActivityTrackerPorts): ActivityTracker {
  let open: OpenSegment | null = null;
  let owner: string | null = null;
  let surface: ActivitySurface = 'other';
  let active = false;

  let lastMono = ports.monotonicNow();
  let lastWall = ports.wallNow();

  /** Wall-clock ms through which accrual has been credited. */
  let lastAccountedWall = lastWall;
  let lastInteractionWall = Number.NEGATIVE_INFINITY;

  let sessionId: string | null = null;
  /** Last credited wall time of any session, used for the 30-minute gap rule. */
  let sessionLastActiveWall = Number.NEGATIVE_INFINITY;

  function rebase(nowMono: number, nowWall: number): void {
    lastMono = nowMono;
    lastWall = nowWall;
  }

  function isAccruing(nowWall: number): boolean {
    return active && nowWall - lastInteractionWall < IDLE_TIMEOUT_MS;
  }

  function writeCheckpoint(): void {
    if (!open) {
      ports.checkpoint(null);
      return;
    }
    ports.checkpoint({
      owner,
      session_id: open.sessionId,
      client_segment_id: open.clientSegmentId,
      surface: open.surface,
      started_at: open.startedAt,
      last_accounted_wall: lastAccountedWall,
      active_ms: open.activeMs,
      interactions: open.interactions,
      last_interaction_wall: lastInteractionWall,
      checkpointed_at: ports.wallNow(),
    });
  }

  /**
   * Emits the open segment ending at `endedAt` — always `lastAccountedWall`,
   * never "now". A segment that ends at the current instant would fold the very
   * gap that closed it into its own span, which is exactly what breaks the
   * interval invariant below.
   */
  function closeSegment(reason: SegmentCloseReason, endedAt: number): void {
    const segment = open;
    open = null;
    if (!segment) {
      writeCheckpoint();
      return;
    }

    // Zero-length segments carry no information and would only add rows.
    if (segment.activeMs > 0) {
      const ended = Math.max(endedAt, segment.startedAt);
      ports.emit(
        finalizeSegment({
          client_segment_id: segment.clientSegmentId,
          session_id: segment.sessionId,
          surface: segment.surface,
          started_at: segment.startedAt,
          ended_at: ended,
          // The span is the source of truth for a later cross-device interval
          // union, so `active_ms` may never exceed it.
          active_ms: Math.min(segment.activeMs, ended - segment.startedAt),
          interactions: segment.interactions,
        }),
      );
      sessionLastActiveWall = Math.max(sessionLastActiveWall, endedAt);
    }

    void reason;
    writeCheckpoint();
  }

  /** A gap longer than SESSION_GAP_MS starts a new activity session. */
  function resolveSessionId(startWall: number): string {
    if (
      sessionId === null ||
      startWall - sessionLastActiveWall >= SESSION_GAP_MS
    ) {
      sessionId = ports.createId();
    }
    return sessionId;
  }

  function openSegment(startWall: number): void {
    open = {
      clientSegmentId: ports.createId(),
      sessionId: resolveSessionId(startWall),
      surface,
      startedAt: startWall,
      activeMs: 0,
      interactions: 0,
    };
    lastAccountedWall = startWall;
  }

  /**
   * The only place time is credited. Every state change calls this first, then
   * mutates — otherwise the partial window since the last tick would be either
   * dropped or attributed to the wrong surface/session.
   */
  function settle(): void {
    const nowMono = ports.monotonicNow();
    const nowWall = ports.wallNow();

    if (!open) {
      rebase(nowMono, nowWall);
      return;
    }

    const monoDelta = nowMono - lastMono;
    const wallDelta = nowWall - lastWall;

    // Either clock anomaly ends the segment. A backward step (manual change,
    // NTP correction) must never subtract, and a wall clock that ran past the
    // monotonic clock means the device slept or the tab was frozen. In both
    // cases we cannot say what happened during the gap, so it must not sit
    // inside a segment's span.
    //
    // The un-settled window since the previous tick is dropped rather than
    // credited: we know how long it lasted but not where in wall time it sat,
    // and guessing would put invented time inside a span. The loss is bounded
    // by one TICK_MS per anomaly and can only ever undercount.
    if (
      monoDelta <= 0 ||
      wallDelta <= 0 ||
      wallDelta > monoDelta + CLOCK_SLIP_TOLERANCE_MS
    ) {
      closeSegment('clock_slip', lastAccountedWall);
      rebase(nowMono, nowWall);
      return;
    }

    const clockDelta = Math.min(monoDelta, wallDelta);

    // Only the part of this window that falls inside the idle horizon counts.
    // A tick that arrives 20 s late when the last interaction was 55 s ago is
    // worth 5 s — not zero, and not the full 20.
    const idleDeadline = lastInteractionWall + IDLE_TIMEOUT_MS;
    const remainingUntilIdle = Math.max(0, idleDeadline - lastAccountedWall);
    const creditable = Math.min(clockDelta, remainingUntilIdle);

    // Credit in slices bounded by what is left of the segment's budget, closing
    // at the boundary and rolling the remainder into the successor.
    //
    // Crossing MAX_SEGMENT_MS mid-window is the normal case rather than an edge
    // one: a real timer never fires exactly on TICK_MS, so 180 ticks credit a
    // little over fifteen minutes. Adding the window whole and only then
    // checking the cap would put those extra milliseconds on the wire, where the
    // transport contract rejects the whole batch they travel in.
    let pending = creditable;
    let split = false;
    while (pending > 0) {
      const current = open;
      if (!current) break;

      const credited = Math.min(pending, MAX_SEGMENT_MS - current.activeMs);
      current.activeMs += credited;
      lastAccountedWall += credited;
      pending -= credited;

      if (current.activeMs < MAX_SEGMENT_MS) break;

      const boundary = lastAccountedWall;
      closeSegment('max_segment', boundary);
      split = true;
      if (!isAccruing(nowWall)) break;
      openSegment(boundary);
    }

    rebase(nowMono, nowWall);

    if (creditable < clockDelta) {
      // Ran out of idle budget partway through the window.
      closeSegment('idle', lastAccountedWall);
      return;
    }

    if (split) {
      // A successor that also crosses midnight is split on the next tick, the
      // same way any other freshly opened segment is.
      writeCheckpoint();
      return;
    }

    if (open && utcDayIndex(open.startedAt) !== utcDayIndex(lastAccountedWall)) {
      const boundary = lastAccountedWall;
      closeSegment('day_rollover', boundary);
      if (isAccruing(nowWall)) openSegment(boundary);
      writeCheckpoint();
      return;
    }

    writeCheckpoint();
  }

  /**
   * What `settle()` would credit if it ran right now, without mutating
   * anything.
   *
   * The tracker settles on a five-second tick, which is the right cadence for
   * measurement but wrong for a clock the learner is watching: between ticks
   * the display stood still, and then jumped five seconds. Mirroring the credit
   * rule here — same clock-anomaly guard, same idle horizon, same segment
   * budget — lets the UI show the value the next tick will arrive at, so the
   * seconds run continuously and never overshoot what is actually recorded.
   */
  function uncreditedMs(): number {
    if (!open) return 0;
    const monoDelta = ports.monotonicNow() - lastMono;
    const wallDelta = ports.wallNow() - lastWall;
    if (monoDelta <= 0 || wallDelta <= 0 || wallDelta > monoDelta + CLOCK_SLIP_TOLERANCE_MS) return 0;
    const remainingUntilIdle = Math.max(0, lastInteractionWall + IDLE_TIMEOUT_MS - lastAccountedWall);
    return Math.max(
      0,
      Math.min(monoDelta, wallDelta, remainingUntilIdle, MAX_SEGMENT_MS - open.activeMs),
    );
  }

  function ensureOpen(nowWall: number): void {
    if (open || !isAccruing(nowWall)) return;
    openSegment(nowWall);
    rebase(ports.monotonicNow(), nowWall);
  }

  return {
    setActive(next: boolean): void {
      if (next === active) return;
      settle();
      if (!next) {
        closeSegment('inactive', lastAccountedWall);
        active = false;
        return;
      }
      active = true;
      // Becoming active is not itself interaction: a tab revealed in the
      // background stays idle until the user actually does something.
      rebase(ports.monotonicNow(), ports.wallNow());
    },

    setSurface(next: ActivitySurface): void {
      if (next === surface) return;
      settle();
      const boundary = lastAccountedWall;
      closeSegment('surface_change', boundary);
      surface = next;
      const nowWall = ports.wallNow();
      ensureOpen(nowWall);
      writeCheckpoint();
    },

    setOwner(next: string | null): void {
      if (next === owner) return;
      settle();
      closeSegment('owner_change', lastAccountedWall);
      owner = next;
      // A new identity gets a new session; carrying one across accounts would
      // stitch two people's activity into a single session id.
      sessionId = null;
      sessionLastActiveWall = Number.NEGATIVE_INFINITY;
      writeCheckpoint();
    },

    noteInteraction(): void {
      settle();
      const nowWall = ports.wallNow();
      lastInteractionWall = nowWall;
      if (!open && active) {
        openSegment(nowWall);
        rebase(ports.monotonicNow(), nowWall);
      }
      if (open) open.interactions += 1;
      writeCheckpoint();
    },

    tick(): void {
      settle();
      ensureOpen(ports.wallNow());
    },

    close(reason: SegmentCloseReason = 'shutdown'): void {
      settle();
      closeSegment(reason, lastAccountedWall);
    },

    restore(checkpoint: ActivityCheckpoint): void {
      // Recovery emits what the dead instance had credited, ending at its own
      // last accounted moment — never at boot time, or an overnight crash would
      // report the whole night as study.
      if (checkpoint.active_ms > 0) {
        const ended = Math.max(checkpoint.last_accounted_wall, checkpoint.started_at);
        ports.emit(
          finalizeSegment({
            client_segment_id: checkpoint.client_segment_id,
            session_id: checkpoint.session_id,
            surface: checkpoint.surface,
            started_at: checkpoint.started_at,
            ended_at: ended,
            active_ms: Math.min(checkpoint.active_ms, ended - checkpoint.started_at),
            interactions: checkpoint.interactions,
          }),
        );
      }

      // Continue the same session when the interruption was short: an ordinary
      // reload should not split one session in two and halve median length.
      const nowWall = ports.wallNow();
      if (nowWall - checkpoint.last_accounted_wall < SESSION_GAP_MS) {
        sessionId = checkpoint.session_id;
        sessionLastActiveWall = checkpoint.last_accounted_wall;
      }
      ports.checkpoint(null);
    },

    peek() {
      return {
        open: open !== null,
        accruing: isAccruing(ports.wallNow()),
        sessionId,
        activeMs: open?.activeMs ?? 0,
        uncreditedMs: uncreditedMs(),
        surface,
      };
    },
  };
}
