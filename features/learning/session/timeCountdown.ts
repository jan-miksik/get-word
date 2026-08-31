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
 * A time budget has no items to count off, so the day is cut by the clock.
 * This is the ordinary three-act default; the frozen session plan replaces it
 * with two halves for a learner with no reviews, or expands the opening review
 * share when backlog pressure applies.
 */
export const TIME_PHASE_SHARES = [1 / 3, 1 / 3, 1 / 3] as const;

/** Cumulative share at which each later phase begins. */
function timePhaseBoundaries(shares: readonly number[]): number[] {
  let spent = 0;
  return shares.slice(0, -1).map((share) => {
    spent += share;
    return spent;
  });
}

export const TIME_PHASE_BOUNDARIES = timePhaseBoundaries(TIME_PHASE_SHARES);

export const TIME_PHASE_COUNT = TIME_PHASE_SHARES.length;

/**
 * The last stretch of the budget, where the countdown may finally be loud.
 *
 * For the rest of the day the digits are read out of the corner of an eye and
 * nothing about the seconds is worth knowing — whether 7:43 or 7:44 is left
 * changes nothing a learner can act on, while the digit changing sixty times a
 * minute is the strongest thing on a screen whose subject is supposed to be the
 * card. So the strip counts in whole minutes, and only inside this last window
 * does it switch to `m:ss` and take the contrast back. There the seconds *are*
 * the information: this is the run to the finish.
 */
export const TIME_ENDGAME_MS = 60_000;

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
  /** Which stretch the clock is in; the configured share count means time is spent. */
  phase: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Which stretch of the day the clock has reached. Once the whole budget is
 * spent, returns `phaseShares.length` as an explicit terminal phase.
 *
 * Time, not answers, is what moves a minutes day along: a learner who is slower
 * than planned still meets new words rather than spending the whole budget on
 * the warm-up, and a learner who is faster simply arrives at each stretch with
 * more of it left.
 */
export function timePhaseIndex(
  activeMs: number,
  budgetMs: number,
  phaseShares: readonly number[] = TIME_PHASE_SHARES,
): number {
  if (budgetMs <= 0) return 0;
  const spent = Math.max(0, activeMs) / budgetMs;
  if (spent >= 1) return phaseShares.length;
  let phase = 0;
  for (const boundary of timePhaseBoundaries(phaseShares)) {
    if (spent >= boundary) phase += 1;
  }
  return phase;
}

export function computeTimeCountdown(
  activeMs: number,
  budgetMs: number,
  phaseShares: readonly number[] = TIME_PHASE_SHARES,
): TimeCountdown {
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
    phase: timePhaseIndex(active, budget, phaseShares),
  };
}
