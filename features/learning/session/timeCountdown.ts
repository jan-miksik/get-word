/**
 * The geometry of a minutes goal drawn as a countdown.
 *
 * A words goal is a pile that fills up, so it fills. A minutes goal is a budget
 * that is spent, so it drains: the day starts with the whole time on the wall
 * and ends at nothing. Drawing it the other way round — a bar filling towards
 * ten minutes — asks the learner to subtract in their head to answer the only
 * question they actually have, which is how much longer.
 *
 * Everything here is pure. The one number that comes from outside is
 * `activeMs`, and it is the *measured* active time from the activity tracker,
 * never wall-clock time since the session opened. That is the whole reason a
 * tab left open cannot spend the budget.
 */

const MINUTE_MS = 60_000;

/**
 * How a minutes day is divided, in shares of the budget.
 *
 * A time budget has no items to count off, so the day is cut by the clock
 * instead: warm up on repeats, meet the new words while attention is freshest,
 * then spend the long tail consolidating. The shares are the same three-act
 * shape a words day gets from its block sizes — `review → new → review` — only
 * measured in minutes.
 */
export const TIME_PHASE_SHARES = [0.3, 0.3, 0.4] as const;

/** Cumulative share at which each later phase begins. */
export const TIME_PHASE_BOUNDARIES = [
  TIME_PHASE_SHARES[0],
  TIME_PHASE_SHARES[0] + TIME_PHASE_SHARES[1],
] as const;

export const TIME_PHASE_COUNT = TIME_PHASE_SHARES.length;

export interface TimeCountdown {
  budgetMs: number;
  /** Measured active time credited to the day so far. */
  activeMs: number;
  /** What is left of the budget; never negative, so overrun reads as zero. */
  remainingMs: number;
  /** True once the budget is spent. */
  finished: boolean;
  /** Whole minutes the budget covers; the unit the goal was set in. */
  minutes: number;
  /** What is left of the budget as a share of it, for the mini progress. */
  remainingFraction: number;
  /** Which stretch the clock is in; TIME_PHASE_COUNT means the budget is spent. */
  phase: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Which stretch of the day the clock has reached, 0–2. Once the whole budget
 * is spent, returns `TIME_PHASE_COUNT` as an explicit terminal phase.
 *
 * Time, not answers, is what moves a minutes day along: a learner who is slower
 * than planned still meets new words rather than spending the whole budget on
 * the warm-up, and a learner who is faster simply arrives at each stretch with
 * more of it left.
 */
export function timePhaseIndex(activeMs: number, budgetMs: number): number {
  if (budgetMs <= 0) return 0;
  const spent = Math.max(0, activeMs) / budgetMs;
  if (spent >= 1) return TIME_PHASE_COUNT;
  let phase = 0;
  for (const boundary of TIME_PHASE_BOUNDARIES) {
    if (spent >= boundary) phase += 1;
  }
  return phase;
}

export function computeTimeCountdown(activeMs: number, budgetMs: number): TimeCountdown {
  const budget = Math.max(0, budgetMs);
  const active = Math.max(0, activeMs);
  const remainingMs = Math.max(0, budget - active);

  return {
    budgetMs: budget,
    activeMs: active,
    remainingMs,
    finished: budget > 0 && remainingMs <= 0,
    minutes: Math.max(1, Math.ceil(budget / MINUTE_MS)),
    remainingFraction: budget > 0 ? clamp01(remainingMs / budget) : 0,
    phase: timePhaseIndex(active, budget),
  };
}
