import type { SessionBlockProgress } from './dayProgress';
import { TIME_PHASE_COUNT } from './timeCountdown';

export interface SessionFlowState {
  /** Index into the plan's blocks, or -1 once every block is finished. */
  index: number;
  /** The whole day's plan, in order — what the day rail draws. */
  blocks: readonly SessionBlockProgress[];
  block: SessionBlockProgress | null;
  /** The block after the current one, for the breather's "up next". */
  next: SessionBlockProgress | null;
  blockNumber: number;
  blockCount: number;
  /** Items answered today across the whole plan, and the plan's length. */
  dayDone: number;
  dayTotal: number;
  /** Answered but not yet committed to progress; display-only, see `pending`. */
  dayPending: number;
  /**
   * The day is walked. True on the answer itself, not on the SRS write that
   * follows it — a step the learner has taken is a step they have taken, and
   * waiting for the deck's exit animation made the last card of a block (and of
   * the day) appear to count only once the *next* card was already on screen.
   */
  complete: boolean;
  /**
   * The same thing, counted from committed answers only. Anything that has to
   * agree with the server — refreshing the day rollup, above all — waits for
   * this instead, because a read fired on the tap races the write it is reading.
   */
  settled: boolean;
}

const EMPTY: SessionFlowState = {
  index: -1,
  blocks: [],
  block: null,
  next: null,
  blockNumber: 0,
  blockCount: 0,
  dayDone: 0,
  dayTotal: 0,
  dayPending: 0,
  complete: false,
  settled: false,
};

/**
 * The current block is the first one still owing work.
 *
 * A block can also run out of *available* words — everything in it was answered
 * on another device, or filtered away — which is what `liveRemaining` catches.
 * Such a block is stepped over rather than left blocking the session forever,
 * but its unanswered items still count against the day, so the day total stays
 * honest about what was planned.
 */
export function resolveSessionFlow(
  blocks: readonly SessionBlockProgress[],
  /**
   * The time stretch the clock has reached on a minutes day. Given, blocks
   * belonging to a stretch already behind the clock are stepped over even when
   * they still hold words: the budget for that kind of work has been spent, and
   * the words themselves are simply still due. Absent — a words day — the plan
   * is walked block by block as before.
   */
  currentPhase?: number,
  /** Number of clock stretches in this frozen minutes plan. */
  phaseCount: number = TIME_PHASE_COUNT,
): SessionFlowState {
  if (blocks.length === 0) {
    return currentPhase !== undefined && currentPhase >= phaseCount
      ? { ...EMPTY, complete: true, settled: true }
      : EMPTY;
  }

  const dayDone = blocks.reduce((sum, block) => sum + block.done, 0);
  const dayTotal = blocks.reduce((sum, block) => sum + block.total, 0);
  const dayPending = blocks.reduce((sum, block) => sum + block.pending, 0);
  if (currentPhase !== undefined && currentPhase >= phaseCount) {
    return {
      ...EMPTY,
      blocks,
      blockCount: blocks.length,
      dayDone,
      dayTotal,
      dayPending,
      complete: true,
      // The clock can close a minutes day with ordinary cards still left, so
      // "all planned work is done" is not the settlement test here. What must
      // finish before the server rollup is read is the answer already given on
      // the card: once no answer is pending, every write the learner actually
      // made is available for `flushOutboxBeforeRead` to drain.
      settled: dayPending === 0,
    };
  }
  // An answer counts the moment it is given. `pending` is the answer the deck is
  // still animating away; leaving it out here is what made a finished block —
  // and a finished day — announce itself a card late.
  const owesWork = (block: SessionBlockProgress) =>
    block.done + block.pending < block.total && block.liveRemaining > 0;
  const owesCommittedWork = (block: SessionBlockProgress) =>
    block.done < block.total && block.liveRemaining > 0;
  const settled = blocks.every((block) => !owesCommittedWork(block));
  const index = currentPhase === undefined
    ? blocks.findIndex(owesWork)
    // The clock owns the phase. A future block must never leak into the current
    // one; the live minutes resolver decides whether an exhausted opening review
    // can use new material and whether an empty stretch needs an explicit card.
    : blocks.findIndex((block) => (block.phase ?? 0) === currentPhase && owesWork(block));

  if (index === -1 && currentPhase === undefined) {
    return { ...EMPTY, blocks, blockCount: blocks.length, dayDone, dayTotal, dayPending, complete: true, settled };
  }
  if (index === -1) {
    // A minutes day can run out of material before it runs out of time. Keep the
    // clock alive and the session open; the empty-state actions let the learner
    // add material, while only the terminal time phase closes the goal.
    return { ...EMPTY, blocks, blockCount: blocks.length, dayDone, dayTotal, dayPending, settled };
  }
  return {
    index,
    blocks,
    block: blocks[index],
    next: blocks[index + 1] ?? null,
    blockNumber: index + 1,
    blockCount: blocks.length,
    dayDone,
    dayTotal,
    dayPending,
    complete: false,
    settled: false,
  };
}
