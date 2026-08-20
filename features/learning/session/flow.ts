import type { SessionBlockProgress } from './dayProgress';

export interface SessionFlowState {
  /** Index into the plan's blocks, or -1 once every block is finished. */
  index: number;
  block: SessionBlockProgress | null;
  /** The block after the current one, for the breather's "up next". */
  next: SessionBlockProgress | null;
  blockNumber: number;
  blockCount: number;
  /** Items answered today across the whole plan, and the plan's length. */
  dayDone: number;
  dayTotal: number;
  complete: boolean;
}

const EMPTY: SessionFlowState = {
  index: -1,
  block: null,
  next: null,
  blockNumber: 0,
  blockCount: 0,
  dayDone: 0,
  dayTotal: 0,
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
export function resolveSessionFlow(blocks: readonly SessionBlockProgress[]): SessionFlowState {
  if (blocks.length === 0) return EMPTY;

  const dayDone = blocks.reduce((sum, block) => sum + block.done, 0);
  const dayTotal = blocks.reduce((sum, block) => sum + block.total, 0);
  const index = blocks.findIndex((block) => block.done < block.total && block.liveRemaining > 0);

  if (index === -1) {
    return { ...EMPTY, blockCount: blocks.length, dayDone, dayTotal, complete: true };
  }
  return {
    index,
    block: blocks[index],
    next: blocks[index + 1] ?? null,
    blockNumber: index + 1,
    blockCount: blocks.length,
    dayDone,
    dayTotal,
    complete: false,
  };
}
