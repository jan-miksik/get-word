import { describe, expect, it } from 'vitest';

import { resolveSessionFlow } from '../flow';
import type { SessionBlockProgress } from '../dayProgress';

function block(partial: Partial<SessionBlockProgress> & { key: string }): SessionBlockProgress {
  return {
    kind: 'review',
    total: 6,
    done: 0,
    pending: 0,
    liveRemaining: 6,
    unavailable: 0,
    ...partial,
  };
}

describe('resolveSessionFlow', () => {
  it('steps to the next block on the answer, not on the SRS write behind it', () => {
    const flow = resolveSessionFlow([
      block({ key: 'review-0', total: 3, done: 2, pending: 1, liveRemaining: 1 }),
      block({ key: 'new-0', kind: 'new', total: 4, liveRemaining: 4 }),
    ]);
    expect(flow.block?.key).toBe('new-0');
  });

  it('closes the day on the last answer while reporting it unsettled', () => {
    const flow = resolveSessionFlow([
      block({ key: 'review-0', total: 3, done: 2, pending: 1, liveRemaining: 1 }),
    ]);
    expect(flow.complete).toBe(true);
    // The server rollup is written from an answer still on its way, so anything
    // that has to agree with it waits for `settled` instead.
    expect(flow.settled).toBe(false);
  });

  it('settles once every answer is committed', () => {
    const flow = resolveSessionFlow([block({ key: 'review-0', total: 3, done: 3, liveRemaining: 0 })]);
    expect(flow).toMatchObject({ complete: true, settled: true });
  });

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

describe('resolveSessionFlow on a minutes day', () => {
  const day = () => [
    block({ key: 'review-0', phase: 0, total: 6 }),
    block({ key: 'new-0', kind: 'new', phase: 1, total: 4, liveRemaining: 4 }),
    block({ key: 'review-1', phase: 2, total: 8, liveRemaining: 8 }),
  ];

  it('starts on the opening stretch while the clock is still in it', () => {
    expect(resolveSessionFlow(day(), 0).block?.key).toBe('review-0');
  });

  it('hands the session on when the stretch time is spent, unfinished or not', () => {
    const flow = resolveSessionFlow(day(), 1);

    expect(flow.block?.key).toBe('new-0');
    // The repeats nobody got to are simply still due; the day keeps counting
    // them so its own total stays honest about what was planned.
    expect(flow.dayTotal).toBe(18);
    expect(flow.dayDone).toBe(0);
  });

  it('does not leak a future block into an exhausted clock stretch', () => {
    const blocks = day();
    blocks[0] = block({ key: 'review-0', phase: 0, total: 6, done: 6, liveRemaining: 0 });

    expect(resolveSessionFlow(blocks, 0).block).toBeNull();
  });

  it('stays open without material until the time budget itself is spent', () => {
    const blocks = day();
    blocks[2] = block({ key: 'review-1', phase: 2, total: 8, done: 8, liveRemaining: 0 });

    const flow = resolveSessionFlow(blocks, 2);
    expect(flow.block).toBeNull();
    expect(flow.complete).toBe(false);
  });

  it('completes at the terminal time phase even with cards left', () => {
    const flow = resolveSessionFlow(day(), 3);

    expect(flow.block).toBeNull();
    expect(flow.complete).toBe(true);
  });

  it('waits for an already-given answer to settle after the clock ends', () => {
    const blocks = day();
    blocks[2] = block({
      key: 'review-1', phase: 2, total: 8, done: 3, pending: 1, liveRemaining: 5,
    });

    expect(resolveSessionFlow(blocks, 3)).toMatchObject({ complete: true, settled: false });
    blocks[2] = block({
      key: 'review-1', phase: 2, total: 8, done: 4, pending: 0, liveRemaining: 4,
    });
    expect(resolveSessionFlow(blocks, 3)).toMatchObject({ complete: true, settled: true });
  });

  it('ends a two-stretch first day at phase two', () => {
    const firstDay = [
      block({ key: 'new-0', kind: 'new', phase: 0, total: 2 }),
      block({ key: 'review-0', phase: 1, total: 2 }),
    ];

    expect(resolveSessionFlow(firstDay, 1, 2).complete).toBe(false);
    expect(resolveSessionFlow(firstDay, 2, 2).complete).toBe(true);
  });
});
