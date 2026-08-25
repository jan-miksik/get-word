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
  complete: boolean;
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
): SessionFlowState {
  if (blocks.length === 0) {
    return currentPhase !== undefined && currentPhase >= TIME_PHASE_COUNT
      ? { ...EMPTY, complete: true }
      : EMPTY;
  }

  const dayDone = blocks.reduce((sum, block) => sum + block.done, 0);
  const dayTotal = blocks.reduce((sum, block) => sum + block.total, 0);
  const dayPending = blocks.reduce((sum, block) => sum + block.pending, 0);
  if (currentPhase !== undefined && currentPhase >= TIME_PHASE_COUNT) {
    return {
      ...EMPTY,
      blocks,
      blockCount: blocks.length,
      dayDone,
      dayTotal,
      dayPending,
      complete: true,
    };
  }
  const owesWork = (block: SessionBlockProgress) => block.done < block.total && block.liveRemaining > 0;
  const index = currentPhase === undefined
    ? blocks.findIndex(owesWork)
    // Falls forward, never back: a stretch whose material runs out early hands
    // the session to the next one instead of ending the day.
    : blocks.findIndex((block) => (block.phase ?? 0) >= currentPhase && owesWork(block));

  if (index === -1 && currentPhase === undefined) {
    return { ...EMPTY, blocks, blockCount: blocks.length, dayDone, dayTotal, dayPending, complete: true };
  }
  if (index === -1) {
    // A minutes day can run out of material before it runs out of time. Keep the
    // clock alive and the session open; the empty-state actions let the learner
    // add material, while only the terminal time phase closes the goal.
    return { ...EMPTY, blocks, blockCount: blocks.length, dayDone, dayTotal, dayPending };
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
  };
}
