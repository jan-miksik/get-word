import { describe, expect, it } from 'vitest';

import { resolveSessionFlow } from '../flow';
import type { SessionBlockProgress } from '../dayProgress';

function block(partial: Partial<SessionBlockProgress> & { key: string }): SessionBlockProgress {
  return {
    kind: 'review',
    total: 6,
    done: 0,
    liveRemaining: 6,
    unavailable: 0,
    ...partial,
  };
}

describe('resolveSessionFlow', () => {
  it('reports nothing for an empty plan', () => {
    expect(resolveSessionFlow([])).toMatchObject({ index: -1, complete: false, dayTotal: 0 });
  });

  it('points at the first block that still owes work', () => {
    const flow = resolveSessionFlow([
      block({ key: 'review-0', done: 6, liveRemaining: 0 }),
      block({ key: 'new-0', kind: 'new', total: 4, done: 1, liveRemaining: 3 }),
      block({ key: 'review-1', total: 8 }),
    ]);
    expect(flow.index).toBe(1);
    expect(flow.block?.key).toBe('new-0');
    expect(flow.next?.key).toBe('review-1');
    expect(flow.blockNumber).toBe(2);
    expect(flow.blockCount).toBe(3);
  });

  it('sums the whole day, not just the current block', () => {
    const flow = resolveSessionFlow([
      block({ key: 'review-0', total: 6, done: 6, liveRemaining: 0 }),
      block({ key: 'new-0', kind: 'new', total: 4, done: 1, liveRemaining: 3 }),
    ]);
    expect(flow.dayDone).toBe(7);
    expect(flow.dayTotal).toBe(10);
  });

  it('steps over a block whose words are no longer available', () => {
    const flow = resolveSessionFlow([
      block({ key: 'review-0', total: 6, done: 2, liveRemaining: 0, unavailable: 4 }),
      block({ key: 'new-0', kind: 'new', total: 4, liveRemaining: 4 }),
    ]);
    expect(flow.block?.key).toBe('new-0');
    // The stepped-over items still count against the day.
    expect(flow.dayTotal).toBe(10);
    expect(flow.dayDone).toBe(2);
  });

  it('completes once no block has live work left', () => {
    const flow = resolveSessionFlow([
      block({ key: 'review-0', done: 6, liveRemaining: 0 }),
      block({ key: 'new-0', kind: 'new', total: 4, done: 4, liveRemaining: 0 }),
    ]);
    expect(flow.complete).toBe(true);
    expect(flow.block).toBeNull();
    expect(flow.dayDone).toBe(10);
  });
});
