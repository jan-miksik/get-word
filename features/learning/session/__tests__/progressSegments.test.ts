import { describe, expect, it } from 'vitest';
import type { SessionBlockProgress } from '../dayProgress';
import {
  reachableTotal,
  segmentFillPercent,
  segmentFlexGrow,
  toProgressSegments,
} from '../progressSegments';

const block = (
  key: string,
  kind: SessionBlockProgress['kind'],
  total: number,
  done = 0,
  pending = 0,
): SessionBlockProgress => ({
  key,
  kind,
  total,
  done,
  pending,
  liveRemaining: total - done,
  unavailable: 0,
});

describe('toProgressSegments', () => {
  it('sizes segments by their item counts', () => {
    const segments = toProgressSegments(
      [block('r1', 'review', 10), block('n1', 'new', 5)],
      1,
    );
    expect(segments.map((segment) => segment.total)).toEqual([10, 5]);
    // 2 : 1 — the review stretch is drawn twice as long as the new one.
    const smallest = Math.min(...segments.map(segmentFlexGrow));
    expect(segments.map((segment) => segmentFlexGrow(segment) / smallest)).toEqual([2, 1]);
  });

  it('draws the bonus round\'s several stretches of each kind as two segments', () => {
    const segments = toProgressSegments(
      [
        block('bonus-review-0', 'review', 10),
        block('bonus-review-1', 'review', 4),
        block('bonus-new-2', 'new', 10),
        block('bonus-new-3', 'new', 3),
      ],
      0,
    );
    expect(segments.map((segment) => [segment.kind, segment.total])).toEqual([
      ['review', 14],
      ['new', 13],
    ]);
  });

  it('draws several blocks of one kind as one segment, at the place of the first', () => {
    const segments = toProgressSegments(
      [block('r1', 'review', 6), block('n1', 'new', 5), block('r2', 'review', 4)],
      0,
    );
    expect(segments.map((segment) => [segment.kind, segment.total])).toEqual([
      ['review', 10],
      ['new', 5],
    ]);
    expect(segments[0].blockKeys).toEqual(['r1', 'r2']);
    expect(segments[1].blockKeys).toEqual(['n1']);
  });

  it('sums the progress of the merged blocks and keeps the day total honest', () => {
    const blocks = [
      block('r1', 'review', 6, 6),
      block('n1', 'new', 5, 2, 1),
      block('r2', 'review', 4, 1),
    ];
    const segments = toProgressSegments(blocks, 1);
    expect(segments[0]).toMatchObject({ kind: 'review', total: 10, done: 7, pending: 0 });
    expect(segmentFillPercent(segments[0])).toBe(70);
    expect(segmentFillPercent(segments[1])).toBe(60);
    // Nothing is lost or double counted by the merge.
    const dayTotal = blocks.reduce((sum, item) => sum + item.total, 0);
    expect(segments.reduce((sum, segment) => sum + segment.total, 0)).toBe(dayTotal);
  });

  it('marks the merged segment active while any of its blocks is current', () => {
    const blocks = [block('r1', 'review', 6, 6), block('n1', 'new', 5), block('r2', 'review', 4)];
    expect(toProgressSegments(blocks, 2).map((segment) => segment.active)).toEqual([true, false]);
    expect(toProgressSegments(blocks, 1).map((segment) => segment.active)).toEqual([false, true]);
    // No current block (the day is done) leaves every segment unhighlighted.
    expect(toProgressSegments(blocks, -1).map((segment) => segment.active)).toEqual([false, false]);
  });

  it('is a pure view: it never reorders or rewrites the plan it is given', () => {
    const blocks = [block('r1', 'review', 6), block('n1', 'new', 5), block('r2', 'review', 4)];
    const snapshot = JSON.parse(JSON.stringify(blocks));
    toProgressSegments(blocks, 0);
    expect(blocks).toEqual(snapshot);
  });

  it('counts uncommitted answers as done and never overfills', () => {
    expect(segmentFillPercent({
      key: 'r1',
      kind: 'review',
      total: 4,
      done: 3,
      pending: 3,
      unavailable: 0,
      active: true,
      blockKeys: ['r1'],
    })).toBe(100);
    expect(segmentFillPercent({
      key: 'empty',
      kind: 'new',
      total: 0,
      done: 0,
      pending: 0,
      unavailable: 0,
      active: false,
      blockKeys: ['empty'],
    })).toBe(0);
    expect(segmentFlexGrow({
      key: 'empty',
      kind: 'new',
      total: 0,
      done: 0,
      pending: 0,
      unavailable: 0,
      active: false,
      blockKeys: ['empty'],
    })).toBe(1);
  });

  // A word the stream cannot serve — answered on another device, filtered out of
  // the selection — used to sit in the denominator, so a fully walked stretch
  // stopped short of the top and the rail read as unfinished work that was not
  // coming.
  it('measures the fill against what the stream can actually serve', () => {
    const stretch = {
      key: 'r1',
      kind: 'review' as const,
      total: 5,
      done: 3,
      pending: 0,
      unavailable: 2,
      active: true,
      blockKeys: ['r1'],
    };
    expect(reachableTotal(stretch)).toBe(3);
    expect(segmentFillPercent(stretch)).toBe(100);
    // Nothing left to serve at all: the session steps over the stretch, so the
    // rail draws it as behind the learner rather than as work still owed.
    expect(segmentFillPercent({ ...stretch, done: 0, unavailable: 5 })).toBe(100);
  });

  it('keeps unavailable items out of the merged segment only as a denominator', () => {
    const segments = toProgressSegments(
      [
        { key: 'r1', kind: 'review', total: 6, done: 4, pending: 0, liveRemaining: 0, unavailable: 2 },
        { key: 'n1', kind: 'new', total: 5, done: 0, pending: 0, liveRemaining: 5, unavailable: 0 },
        { key: 'r2', kind: 'review', total: 4, done: 0, pending: 0, liveRemaining: 3, unavailable: 1 },
      ],
      1,
    );
    // The day total stays honest about what was planned…
    expect(segments[0].total).toBe(10);
    // …while the rail measures the 7 items it can still walk.
    expect(reachableTotal(segments[0])).toBe(7);
    expect(segmentFillPercent(segments[0])).toBeCloseTo((4 / 7) * 100);
  });
});
