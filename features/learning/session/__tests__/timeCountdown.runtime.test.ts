import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The countdown against the real activity runtime.
 *
 * The point of these tests is that the clock the learner watches and the time
 * the server records are the same number. So nothing here fakes the time
 * source: it drives `lib/activity/runtime` through the actual DOM lifecycle
 * events — focus, blur, pointer input — and reads the countdown back through
 * `computeTimeCountdown`, exactly as the rails do. Only the outbox and the
 * identity are doubled, because they are I/O.
 */

interface QueuedOp {
  entity: string;
  payload: Record<string, unknown>;
}

const appendOp = vi.fn(async (op: QueuedOp): Promise<QueuedOp | null> => op);
const syncState = vi.hoisted(() => ({ owner: 'user-1' as string | null }));

vi.mock('@/lib/local-first/outbox', () => ({ appendOp: (op: QueuedOp) => appendOp(op) }));
vi.mock('@/lib/local-first/drainer', () => ({
  scheduleDrain: () => undefined,
  flushOutboxNow: async () => undefined,
}));
vi.mock('@/lib/local-first/availability', () => ({
  isLocalFirstAvailableSync: () => true,
  ensureLocalFirstAvailability: async () => true,
}));
vi.mock('@/lib/device-id', () => ({ getDeviceId: () => 'device-1' }));
vi.mock('@/lib/sync', () => ({ getSyncOwner: () => syncState.owner }));

import {
  __resetActivityDayLedgersForTests,
  getActivityClockState,
  getBestKnownDayActiveMs,
  seedActivityDayTotal,
  setActivityOwner,
  setActivitySurface,
  startActivityTracking,
} from '@/lib/activity/runtime';
import { currentIanaTimezone, localDayKeyAt } from '@/lib/local-day';
import { IDLE_TIMEOUT_MS } from '@/packages/product/shared/activity/tracker';
import { computeTimeCountdown } from '../timeCountdown';

const START = Date.UTC(2026, 4, 12, 9, 0, 0);
const BUDGET_MS = 10 * 60_000;

let stop: (() => void) | null = null;

function dayKey(): string {
  return localDayKeyAt(Date.now(), currentIanaTimezone());
}

/** What the rails would draw at this instant. */
function countdown() {
  return computeTimeCountdown(getBestKnownDayActiveMs(dayKey()), BUDGET_MS);
}

function remainingMs(): number {
  return countdown().remainingMs;
}

/** A real interaction: the same events the runtime listens for. */
function interact(): void {
  window.dispatchEvent(new Event('pointerdown'));
}

/** Time passing with the tracker's own tick timer running. */
function advance(ms: number): void {
  vi.advanceTimersByTime(ms);
}

/** Lifecycle events are collapsed through a microtask before they take effect. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  // Cross-tab claim negotiation is not what these tests are about; without a
  // channel the instance claims itself synchronously.
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.useFakeTimers();
  vi.setSystemTime(START);
  localStorage.clear();
  sessionStorage.clear();
  appendOp.mockClear();
  syncState.owner = 'user-1';
  __resetActivityDayLedgersForTests();
  stop = startActivityTracking();
  // The countdown only exists on the study surface, and only the surfaces a
  // study goal credits reach its clock at all.
  setActivitySurface('study');
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('minutes countdown against measured activity', () => {
  it('counts down while the session is actually being used', async () => {
    await settle();
    expect(remainingMs()).toBe(BUDGET_MS);

    interact();
    advance(20_000);

    expect(remainingMs()).toBe(BUDGET_MS - 20_000);
  });

  it('stops counting down when the window loses focus', async () => {
    await settle();
    interact();
    advance(10_000);
    const atBlur = remainingMs();

    window.dispatchEvent(new Event('blur'));
    await settle();
    advance(5 * 60_000);

    // Five minutes in a background tab cost nothing.
    expect(remainingMs()).toBe(atBlur);
  });

  it('counts down again once focus returns and the learner acts', async () => {
    await settle();
    interact();
    advance(10_000);
    window.dispatchEvent(new Event('blur'));
    await settle();
    advance(60_000);
    const afterAway = remainingMs();

    window.dispatchEvent(new Event('focus'));
    await settle();
    interact();
    advance(15_000);

    expect(remainingMs()).toBe(afterAway - 15_000);
  });

  it('stops counting down after 30 seconds without a relevant action', async () => {
    await settle();
    interact();

    // Two full minutes of a focused, visible page with nobody in front of it.
    advance(2 * 60_000);

    // Only the idle horizon itself was spent — this is what stops a tab left
    // open from burning through the goal.
    expect(remainingMs()).toBe(BUDGET_MS - IDLE_TIMEOUT_MS);
    expect(IDLE_TIMEOUT_MS).toBe(30_000);
  });

  it('resumes counting down on the next action after going idle', async () => {
    await settle();
    interact();
    advance(2 * 60_000);
    const whileIdle = remainingMs();

    interact();
    advance(12_000);

    expect(remainingMs()).toBe(whileIdle - 12_000);
  });

  it('reaches zero after a full budget of real use and does not go past it', async () => {
    await settle();

    // Ten minutes of genuine study: an action every ten seconds, which never
    // lets the idle horizon expire.
    for (let step = 0; step < 60; step += 1) {
      interact();
      advance(10_000);
    }

    const atZero = countdown();
    expect(atZero.remainingMs).toBe(0);
    expect(atZero.finished).toBe(true);
    expect(atZero.remainingFraction).toBe(0);

    // Carrying on past the goal leaves the rail empty rather than negative.
    interact();
    advance(60_000);
    expect(remainingMs()).toBe(0);
  });

  it('needs roughly four times as long to spend the budget when only half-attentive', async () => {
    await settle();

    // A tab someone glances at every two minutes: each visit buys 30 seconds.
    for (let step = 0; step < 5; step += 1) {
      interact();
      advance(2 * 60_000);
    }

    expect(remainingMs()).toBe(BUDGET_MS - 5 * IDLE_TIMEOUT_MS);
  });
});

/**
 * What the server knows always lags what the learner has just done: a closed
 * segment waits for the outbox, which is debounced. Every screen that owns the
 * countdown re-seeds the day total when it mounts, so these are the cases where
 * the clock used to fall back to a stale number — or, before anything had been
 * delivered at all, back to the full budget.
 */
describe('the countdown against a lagging server total', () => {
  /** Closes the open segment the way stepping away for a moment does. */
  function goIdle(): void {
    advance(2 * 60_000);
  }

  it('keeps time the server has not folded yet when the day is re-seeded', async () => {
    await settle();
    interact();
    advance(20_000);
    goIdle();
    const spent = BUDGET_MS - remainingMs();

    // A summary fetched before the segment was ever delivered.
    seedActivityDayTotal(dayKey(), 0);

    expect(BUDGET_MS - remainingMs()).toBe(spent);
  });

  it('does not count a delivered segment twice once the server reports it', async () => {
    await settle();
    interact();
    advance(20_000);
    goIdle();
    const spent = BUDGET_MS - remainingMs();

    // The same time, now folded into the day by the server.
    seedActivityDayTotal(dayKey(), spent);

    expect(BUDGET_MS - remainingMs()).toBe(spent);

    interact();
    advance(10_000);
    expect(BUDGET_MS - remainingMs()).toBe(spent + 10_000);
  });

  it('takes a larger server total, which is time measured on another device', async () => {
    await settle();
    interact();
    advance(20_000);
    goIdle();

    seedActivityDayTotal(dayKey(), 5 * 60_000);

    expect(remainingMs()).toBe(BUDGET_MS - 5 * 60_000);
  });

  it('ignores a summary that answers out of order', async () => {
    await settle();
    seedActivityDayTotal(dayKey(), 4 * 60_000);
    seedActivityDayTotal(dayKey(), 60_000);

    expect(remainingMs()).toBe(BUDGET_MS - 4 * 60_000);
  });

  it('does not carry a monotonic day total across an account switch', async () => {
    await settle();
    seedActivityDayTotal(dayKey(), 5 * 60_000);
    expect(remainingMs()).toBe(BUDGET_MS - 5 * 60_000);

    syncState.owner = 'user-2';
    setActivityOwner('user-2');
    seedActivityDayTotal(dayKey(), 60_000);

    expect(remainingMs()).toBe(BUDGET_MS - 60_000);
  });

  it('does not show an owned durable total before the account is known after reload', async () => {
    await settle();
    seedActivityDayTotal(dayKey(), 5 * 60_000);
    expect(getBestKnownDayActiveMs(dayKey())).toBe(5 * 60_000);

    stop?.();
    stop = null;
    syncState.owner = null;
    __resetActivityDayLedgersForTests({ keepStorage: true });
    stop = startActivityTracking();
    setActivitySurface('study');
    await settle();

    expect(getBestKnownDayActiveMs(dayKey())).toBe(0);
  });
});

/**
 * The clock and the day rollup must credit the same surfaces. Adding words or
 * reading a photo's words is studying; browsing lists is not — and the server's
 * `getLocalDayActivity` says so in SQL, so a countdown that disagreed would run
 * down against a total that never caught up with it.
 */
describe('which surfaces reach the countdown', () => {
  it('spends nothing while words are being added', async () => {
    await settle();
    setActivitySurface('word_chat');
    interact();
    advance(20_000);

    expect(remainingMs()).toBe(BUDGET_MS);
  });

  it('spends nothing while the learner is only browsing lists, and keeps what was already spent', async () => {
    await settle();
    setActivitySurface('lists');
    interact();
    advance(20_000);

    expect(remainingMs()).toBe(BUDGET_MS);

    // And the time that follows on a credited surface still counts in full.
    setActivitySurface('study');
    interact();
    advance(10_000);

    expect(remainingMs()).toBe(BUDGET_MS - 10_000);
  });
});

/**
 * The whole round trip the learner actually makes: study, step out to add a
 * word or take a photo, come back. The clock must be exactly where they left
 * it — not at zero, and not further along for the detour.
 */
describe('stepping out of the session and back', () => {
  it('resumes the countdown where it stopped', async () => {
    await settle();
    // Three minutes of answering: an action every ten seconds, so the clock
    // never goes idle on its own.
    for (let step = 0; step < 18; step += 1) {
      interact();
      advance(10_000);
    }
    const spentBefore = BUDGET_MS - remainingMs();
    expect(spentBefore).toBe(3 * 60_000);

    // Off to the word chat, which is measured but not credited to the goal.
    setActivitySurface('word_chat');
    interact();
    advance(2 * 60_000);

    // Back on the deck, and the screen that owns the countdown remounts — which
    // re-seeds the day from a summary the outbox has not reached yet.
    setActivitySurface('study');
    seedActivityDayTotal(dayKey(), 0);

    expect(BUDGET_MS - remainingMs()).toBe(spentBefore);

    interact();
    advance(15_000);
    expect(BUDGET_MS - remainingMs()).toBe(spentBefore + 15_000);
  });
});

/**
 * A reload is an interruption, not a reset.
 *
 * Everything the outbox has not delivered — which after a minute of studying is
 * all of it — lived only in the module's own map. Closing the tab and coming
 * back handed the learner a countdown that had forgotten the stretch they had
 * just done, and the app on a phone is reloaded by the OS, not by them.
 */
describe('surviving a reload', () => {
  it('keeps time the server has not folded yet across a fresh page', async () => {
    await settle();
    for (let step = 0; step < 12; step += 1) {
      interact();
      advance(10_000);
    }
    // Close the segment so it is measured rather than still open.
    setActivitySurface('lists');
    const spent = BUDGET_MS - remainingMs();
    expect(spent).toBe(2 * 60_000);

    // A reload: the runtime and every in-memory ledger go away, localStorage
    // does not, and the summary still answers with what the server has — none
    // of it.
    stop?.();
    __resetActivityDayLedgersForTests({ keepStorage: true });
    stop = startActivityTracking();
    setActivitySurface('study');
    await settle();
    seedActivityDayTotal(dayKey(), 0);

    expect(BUDGET_MS - remainingMs()).toBe(spent);
  });
});

/**
 * Why the clock is not moving, in the runtime's own words. Every one of these
 * used to be a countdown standing still with nothing on screen to explain it.
 */
describe('what the clock says it is doing', () => {
  it('counts while the learner is answering on the deck', async () => {
    await settle();
    interact();
    advance(5_000);

    expect(getActivityClockState()).toBe('counting');
  });

  it('waits for the learner once the idle horizon passes', async () => {
    await settle();
    interact();
    advance(IDLE_TIMEOUT_MS + 5_000);

    expect(getActivityClockState()).toBe('idle');
  });

  it('reports a surface the goal does not credit, even though the tracker is happy there', async () => {
    await settle();
    setActivitySurface('word_chat');
    interact();
    advance(5_000);

    // The tracker really is accruing here — that is exactly why `accruing`
    // alone was the wrong answer: the number it feeds cannot move.
    expect(getActivityClockState()).toBe('elsewhere');
  });

  it('reports a backgrounded app', async () => {
    await settle();
    interact();
    window.dispatchEvent(new Event('blur'));
    await settle();

    expect(getActivityClockState()).toBe('paused');
  });
});
