import { describe, expect, it } from 'vitest';

import {
  CLOCK_SLIP_TOLERANCE_MS,
  IDLE_TIMEOUT_MS,
  MAX_SEGMENT_MS,
  SESSION_GAP_MS,
  TICK_MS,
  createActivityTracker,
  type ActivityCheckpoint,
  type ActivitySegment,
} from '../tracker';

const START_WALL = Date.UTC(2026, 0, 15, 10, 0, 0);

/**
 * Drives the tracker against a fake clock. `advance` moves both clocks
 * together (normal time); `slip` moves only the wall clock, which is what a
 * frozen tab or a sleeping device looks like from inside the page.
 */
function harness(options: { wall?: number } = {}) {
  let mono = 0;
  let wall = options.wall ?? START_WALL;
  let ids = 0;
  const emitted: ActivitySegment[] = [];
  let checkpoint: ActivityCheckpoint | null = null;

  const tracker = createActivityTracker({
    monotonicNow: () => mono,
    wallNow: () => wall,
    emit: (segment) => emitted.push(segment),
    checkpoint: (state) => {
      checkpoint = state;
    },
    createId: () => `id-${++ids}`,
  });

  return {
    tracker,
    emitted,
    get checkpoint() {
      return checkpoint;
    },
    get wall() {
      return wall;
    },
    advance(ms: number) {
      mono += ms;
      wall += ms;
    },
    /** Wall clock jumps ahead while the monotonic clock stands still. */
    slip(ms: number) {
      wall += ms;
    },
    /** Wall clock steps backwards (NTP correction, manual change). */
    rewind(ms: number) {
      mono += ms;
      wall -= ms;
    },
  };
}

/** Starts an accruing segment and returns the wall time it began at. */
function beginActive(h: ReturnType<typeof harness>): number {
  h.tracker.setActive(true);
  h.tracker.noteInteraction();
  return h.wall;
}

describe('activity tracker accrual', () => {
  it('credits only the slice inside the idle horizon when a tick arrives late', () => {
    const h = harness();
    beginActive(h);

    // Five seconds short of the idle deadline, then a tick that is 20 s late.
    // Only the 5 s remaining before the deadline may count.
    h.advance(IDLE_TIMEOUT_MS - 5_000);
    h.tracker.tick();
    h.advance(20_000);
    h.tracker.tick();

    expect(h.emitted).toHaveLength(1);
    expect(h.emitted[0].active_ms).toBe(IDLE_TIMEOUT_MS);
  });

  it('ends an idle-closed segment at the idle deadline, not at now', () => {
    const h = harness();
    const startedAt = beginActive(h);

    h.advance(IDLE_TIMEOUT_MS + 300_000);
    h.tracker.tick();

    expect(h.emitted).toHaveLength(1);
    expect(h.emitted[0].ended_at).toBe(startedAt + IDLE_TIMEOUT_MS);
  });

  it('accrues nothing while inactive', () => {
    const h = harness();
    beginActive(h);
    h.advance(10_000);

    h.tracker.setActive(false);
    const afterBackground = h.emitted[0].active_ms;

    h.advance(120_000);
    h.tracker.tick();

    expect(afterBackground).toBe(10_000);
    expect(h.emitted).toHaveLength(1);
  });

  it('settles before a surface change so time lands on the surface it was spent in', () => {
    const h = harness();
    beginActive(h);

    h.advance(8_000);
    h.tracker.setSurface('lists');
    h.advance(4_000);
    h.tracker.noteInteraction();
    h.tracker.close();

    expect(h.emitted).toHaveLength(2);
    expect(h.emitted[0].surface).toBe('other');
    expect(h.emitted[0].active_ms).toBe(8_000);
    expect(h.emitted[1].surface).toBe('lists');
    expect(h.emitted[1].active_ms).toBe(4_000);
  });
});

describe('clock anomalies', () => {
  it('closes the segment on a forward wall-clock slip instead of spanning it', () => {
    const h = harness();
    const startedAt = beginActive(h);

    h.advance(5_000);
    h.tracker.tick();

    // Device sleeps: wall advances 10 minutes, monotonic does not.
    h.slip(10 * 60_000 + CLOCK_SLIP_TOLERANCE_MS);
    h.tracker.tick();

    expect(h.emitted).toHaveLength(1);
    expect(h.emitted[0].ended_at).toBe(startedAt + 5_000);
    expect(h.emitted[0].active_ms).toBe(5_000);

    // The next credited activity opens a fresh segment rather than resuming.
    h.tracker.noteInteraction();
    h.advance(3_000);
    h.tracker.close();

    expect(h.emitted).toHaveLength(2);
    expect(h.emitted[1].client_segment_id).not.toBe(h.emitted[0].client_segment_id);
    expect(h.emitted[1].active_ms).toBe(3_000);
  });

  it('drops at most the un-settled window when a slip interrupts accrual', () => {
    const h = harness();
    beginActive(h);

    // Two seconds pass with no intervening tick, then the device freezes. The
    // tracker cannot place those two seconds in wall time, so it discards them
    // rather than inventing a span — an undercount bounded by one tick.
    h.advance(2_000);
    h.slip(10 * 60_000);
    h.tracker.tick();

    expect(h.emitted).toHaveLength(0);
    expect(h.tracker.peek().open).toBe(false);
  });

  it('never subtracts when the wall clock steps backwards', () => {
    const h = harness();
    beginActive(h);

    h.advance(6_000);
    h.tracker.tick();
    h.rewind(60_000);
    h.tracker.tick();

    expect(h.emitted).toHaveLength(1);
    expect(h.emitted[0].active_ms).toBe(6_000);
    expect(h.emitted[0].active_ms).toBeGreaterThan(0);
  });
});

describe('segment boundaries', () => {
  it('opens a new segment when interaction resumes after idle', () => {
    const h = harness();
    beginActive(h);

    h.advance(IDLE_TIMEOUT_MS + 10_000);
    h.tracker.tick();
    expect(h.emitted).toHaveLength(1);

    h.tracker.noteInteraction();
    h.advance(7_000);
    h.tracker.close();

    expect(h.emitted).toHaveLength(2);
    expect(h.emitted[1].active_ms).toBe(7_000);
  });

  it('rolls straight into a successor segment at MAX_SEGMENT_MS', () => {
    const h = harness();
    beginActive(h);

    // Keep interacting so the idle horizon never bites.
    for (let elapsed = 0; elapsed < MAX_SEGMENT_MS + TICK_MS; elapsed += TICK_MS) {
      h.advance(TICK_MS);
      h.tracker.noteInteraction();
    }

    expect(h.emitted.length).toBeGreaterThanOrEqual(1);
    expect(h.emitted[0].active_ms).toBe(MAX_SEGMENT_MS);
    // Still active, so a successor is open and picks up where it left off.
    expect(h.tracker.peek().open).toBe(true);
  });

  it('stays under MAX_SEGMENT_MS when the window crosses the cap unevenly', () => {
    const h = harness();
    beginActive(h);

    // A real `setInterval` never fires exactly on TICK_MS, so the window that
    // crosses the cap almost always crosses it partway rather than landing on
    // it. Anything above the cap is refused by the transport schema, and the
    // rejection fails the whole batch — progress writes included.
    const step = TICK_MS + 7;
    let elapsed = 0;
    while (elapsed < MAX_SEGMENT_MS + 3 * TICK_MS) {
      h.advance(step);
      h.tracker.noteInteraction();
      elapsed += step;
    }

    expect(h.emitted.length).toBeGreaterThanOrEqual(1);
    for (const segment of h.emitted) {
      expect(segment.active_ms).toBeLessThanOrEqual(MAX_SEGMENT_MS);
      expect(segment.active_ms).toBeLessThanOrEqual(segment.ended_at - segment.started_at);
    }
    expect(h.emitted[0].active_ms).toBe(MAX_SEGMENT_MS);

    // The slice past the boundary belongs to the successor, not the bin.
    const credited =
      h.emitted.reduce((sum, segment) => sum + segment.active_ms, 0) +
      h.tracker.peek().activeMs;
    expect(credited).toBe(elapsed);
  });

  it('splits at UTC midnight and continues in the new day', () => {
    // Two minutes before midnight UTC.
    const h = harness({ wall: Date.UTC(2026, 0, 15, 23, 58, 0) });
    beginActive(h);

    for (let i = 0; i < 40; i += 1) {
      h.advance(10_000);
      h.tracker.noteInteraction();
    }

    expect(h.emitted.length).toBeGreaterThanOrEqual(1);
    const first = h.emitted[0];
    expect(first.ended_at).toBeLessThanOrEqual(Date.UTC(2026, 0, 16, 0, 0, 0));
    expect(h.tracker.peek().open).toBe(true);
  });
});

describe('activity sessions', () => {
  it('keeps the same session across a gap under 30 minutes', () => {
    const h = harness();
    beginActive(h);
    h.advance(5_000);
    h.tracker.setActive(false);

    h.advance(10 * 60_000);
    h.tracker.setActive(true);
    h.tracker.noteInteraction();
    h.advance(5_000);
    h.tracker.close();

    expect(h.emitted).toHaveLength(2);
    expect(h.emitted[1].session_id).toBe(h.emitted[0].session_id);
  });

  it('starts a new session after more than 30 minutes of inactivity', () => {
    const h = harness();
    beginActive(h);
    h.advance(5_000);
    h.tracker.setActive(false);

    h.advance(SESSION_GAP_MS + 60_000);
    h.tracker.setActive(true);
    h.tracker.noteInteraction();
    h.advance(5_000);
    h.tracker.close();

    expect(h.emitted).toHaveLength(2);
    expect(h.emitted[1].session_id).not.toBe(h.emitted[0].session_id);
  });
});

describe('checkpoint recovery', () => {
  it('emits a recovered segment ending at its own last accounted moment', () => {
    const crashed: ActivityCheckpoint = {
      owner: 'user-1',
      session_id: 'session-1',
      client_segment_id: 'segment-1',
      surface: 'study',
      started_at: Date.UTC(2026, 0, 15, 13, 50, 0),
      last_accounted_wall: Date.UTC(2026, 0, 15, 14, 0, 0),
      active_ms: 10 * 60_000,
      interactions: 42,
      last_interaction_wall: Date.UTC(2026, 0, 15, 14, 0, 0),
      checkpointed_at: Date.UTC(2026, 0, 15, 14, 0, 0),
    };

    // Boots the next morning: the recovered segment must not stretch to now.
    const h = harness({ wall: Date.UTC(2026, 0, 16, 9, 0, 0) });
    h.tracker.restore(crashed);

    expect(h.emitted).toHaveLength(1);
    expect(h.emitted[0].ended_at).toBe(crashed.last_accounted_wall);
    expect(h.emitted[0].active_ms).toBe(10 * 60_000);
  });

  it('continues the checkpointed session after a short reload', () => {
    const startedAt = START_WALL;
    const checkpoint: ActivityCheckpoint = {
      owner: 'user-1',
      session_id: 'session-keep',
      client_segment_id: 'segment-1',
      surface: 'study',
      started_at: startedAt,
      last_accounted_wall: startedAt + 60_000,
      active_ms: 60_000,
      interactions: 5,
      last_interaction_wall: startedAt + 60_000,
      checkpointed_at: startedAt + 60_000,
    };

    const h = harness({ wall: startedAt + 65_000 });
    h.tracker.restore(checkpoint);
    h.tracker.setActive(true);
    h.tracker.noteInteraction();
    h.advance(5_000);
    h.tracker.close();

    const fresh = h.emitted[h.emitted.length - 1];
    expect(fresh.session_id).toBe('session-keep');
  });

  it('starts a new session when the interruption exceeded the session gap', () => {
    const startedAt = START_WALL;
    const checkpoint: ActivityCheckpoint = {
      owner: 'user-1',
      session_id: 'session-old',
      client_segment_id: 'segment-1',
      surface: 'study',
      started_at: startedAt,
      last_accounted_wall: startedAt + 60_000,
      active_ms: 60_000,
      interactions: 5,
      last_interaction_wall: startedAt + 60_000,
      checkpointed_at: startedAt + 60_000,
    };

    const h = harness({ wall: startedAt + SESSION_GAP_MS + 120_000 });
    h.tracker.restore(checkpoint);
    h.tracker.setActive(true);
    h.tracker.noteInteraction();
    h.advance(5_000);
    h.tracker.close();

    const fresh = h.emitted[h.emitted.length - 1];
    expect(fresh.session_id).not.toBe('session-old');
  });

  it('checkpoints the open segment and clears it once nothing is in flight', () => {
    const h = harness();
    beginActive(h);
    h.advance(5_000);
    h.tracker.tick();

    expect(h.checkpoint).not.toBeNull();
    expect(h.checkpoint?.last_accounted_wall).toBe(START_WALL + 5_000);

    h.tracker.close();
    expect(h.checkpoint).toBeNull();
  });
});

describe('owner scoping', () => {
  it('closes the open segment and resets the session when identity changes', () => {
    const h = harness();
    h.tracker.setOwner('user-1');
    beginActive(h);
    h.advance(9_000);

    h.tracker.setOwner('user-2');
    expect(h.emitted).toHaveLength(1);
    expect(h.emitted[0].active_ms).toBe(9_000);

    h.tracker.noteInteraction();
    h.advance(4_000);
    h.tracker.close();

    expect(h.emitted).toHaveLength(2);
    expect(h.emitted[1].session_id).not.toBe(h.emitted[0].session_id);
  });
});

describe('wire shape', () => {
  /**
   * Accrual comes from `performance.now()`, which is fractional, but the sync
   * contract requires an integer `active_ms`. Emitting a float made the server
   * reject every segment with a 400 — invisible to a fake clock that only ever
   * advanced by whole milliseconds.
   */
  it('emits integer milliseconds even when the clock is fractional', () => {
    const h = harness();
    beginActive(h);

    h.advance(1_333.7);
    h.tracker.noteInteraction();
    h.advance(2_111.42);
    h.tracker.close();

    expect(h.emitted).toHaveLength(1);
    const segment = h.emitted[0];
    for (const value of [segment.started_at, segment.ended_at, segment.active_ms, segment.interactions]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    // Rounding must not push credited time past its own interval.
    expect(segment.active_ms).toBeLessThanOrEqual(segment.ended_at - segment.started_at);
  });

  it('keeps a recovered checkpoint integral too', () => {
    const h = harness();
    h.tracker.restore({
      owner: null,
      session_id: 'session-1',
      client_segment_id: 'segment-1',
      surface: 'study',
      started_at: START_WALL + 0.5,
      last_accounted_wall: START_WALL + 9_999.75,
      active_ms: 9_999.25,
      interactions: 3,
      last_interaction_wall: START_WALL + 9_999.75,
      checkpointed_at: START_WALL + 9_999.75,
    });

    const segment = h.emitted[0];
    expect(Number.isInteger(segment.active_ms)).toBe(true);
    expect(Number.isInteger(segment.started_at)).toBe(true);
    expect(Number.isInteger(segment.ended_at)).toBe(true);
    expect(segment.active_ms).toBeLessThanOrEqual(segment.ended_at - segment.started_at);
  });
});

describe('the interval invariant', () => {
  /**
   * Every emitted segment must satisfy `ended_at - started_at ≈ active_ms`.
   * This is the property a future cross-device union depends on: a span with
   * unexplained dead time inside it would report idle minutes as activity.
   */
  it('holds across idle, background, surface change, slip, and rollover', () => {
    const h = harness({ wall: Date.UTC(2026, 0, 15, 23, 55, 0) });
    h.tracker.setOwner('user-1');
    beginActive(h);

    h.advance(4_000);
    h.tracker.noteInteraction();
    h.tracker.setSurface('lists');

    h.advance(3_000);
    h.tracker.noteInteraction();
    h.advance(IDLE_TIMEOUT_MS + 30_000);
    h.tracker.tick();

    h.tracker.noteInteraction();
    h.advance(2_000);
    h.slip(20 * 60_000);
    h.tracker.tick();

    h.tracker.setSurface('photo_lab');
    h.tracker.noteInteraction();
    for (let i = 0; i < 60; i += 1) {
      h.advance(10_000);
      h.tracker.noteInteraction();
    }

    h.tracker.setActive(false);
    h.tracker.setOwner('user-2');

    expect(h.emitted.length).toBeGreaterThanOrEqual(3);
    for (const segment of h.emitted) {
      const span = segment.ended_at - segment.started_at;
      expect(span).toBeGreaterThanOrEqual(0);
      expect(segment.active_ms).toBeLessThanOrEqual(span);
      expect(span).toBeLessThanOrEqual(segment.active_ms + TICK_MS);
    }
  });
});

describe('uncredited display time', () => {
  it('reports the un-settled window so a clock can run between ticks', () => {
    const h = harness();
    beginActive(h);

    h.advance(1_200);
    expect(h.tracker.peek().activeMs).toBe(0);
    expect(h.tracker.peek().uncreditedMs).toBe(1_200);

    // Settling moves the same milliseconds across; the sum never jumps.
    h.tracker.tick();
    expect(h.tracker.peek().activeMs).toBe(1_200);
    expect(h.tracker.peek().uncreditedMs).toBe(0);
  });

  it('stops at the idle horizon rather than running on', () => {
    const h = harness();
    beginActive(h);

    h.advance(IDLE_TIMEOUT_MS + 20_000);
    expect(h.tracker.peek().uncreditedMs).toBe(IDLE_TIMEOUT_MS);
  });

  it('credits nothing while the clocks disagree', () => {
    const h = harness();
    beginActive(h);

    h.advance(2_000);
    h.slip(CLOCK_SLIP_TOLERANCE_MS + 1_000);
    expect(h.tracker.peek().uncreditedMs).toBe(0);
  });

  it('is zero with no open segment', () => {
    const h = harness();
    h.advance(4_000);
    expect(h.tracker.peek().open).toBe(false);
    expect(h.tracker.peek().uncreditedMs).toBe(0);
  });
});
