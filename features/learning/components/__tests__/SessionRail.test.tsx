import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { SessionRail } from '../SessionRail';
import { resolveSessionFlow } from '@/features/learning/session/flow';
import type { SessionBlockProgress } from '@/features/learning/session/dayProgress';

function block(
  key: string,
  done: number,
  total: number,
  kind: SessionBlockProgress['kind'] = 'review',
): SessionBlockProgress {
  return { key, kind, done, total, pending: 0, liveRemaining: total - done, unavailable: 0 };
}

function renderRail(blocks: SessionBlockProgress[], heldBlock: SessionBlockProgress | null = null) {
  return render(
    <I18nProvider language="en">
      <SessionRail flow={resolveSessionFlow(blocks)} heldBlock={heldBlock} />
    </I18nProvider>,
  );
}

describe('SessionRail', () => {
  it('draws the day while work remains', () => {
    const { container } = renderRail([block('review-0', 2, 6)]);

    expect(container.firstChild).not.toBeNull();
  });

  it('gets out of the way once the day is walked', () => {
    const { container } = renderRail([block('review-0', 6, 6)]);

    expect(container.firstChild).toBeNull();
  });

  it('draws the day as its two stretches, sized by item counts', () => {
    const { container } = renderRail([
      block('review-0', 0, 10),
      block('new-0', 0, 5, 'new'),
    ]);

    // The right-hand rail is the day: repeats first, drawn twice as long as the
    // new stretch behind them.
    const dayRail = container.querySelector('.right-0');
    const segments = Array.from(dayRail?.children ?? []) as HTMLElement[];
    expect(segments.map((segment) => segment.style.flexGrow)).toEqual(['10', '5']);
  });

  it('folds a bonus round\'s repeated stretches into the same two segments', () => {
    const { container } = renderRail([
      block('bonus-review-0', 0, 10),
      block('bonus-review-1', 0, 4),
      block('bonus-new-2', 0, 6, 'new'),
    ]);

    const dayRail = container.querySelector('.right-0');
    const segments = Array.from(dayRail?.children ?? []) as HTMLElement[];
    expect(segments.map((segment) => segment.style.flexGrow)).toEqual(['14', '6']);
  });

  // The itinerary must not shrink while completed cards leave the live stream.
  // This is especially visible in a ten-card bonus round containing typing.
  it('keeps one fixed tick per planned item when some become unavailable', () => {
    const { container } = renderRail([
      { key: 'review-0', kind: 'review', done: 2, total: 10, pending: 0, liveRemaining: 5, unavailable: 3 },
    ]);

    const blockRail = container.querySelector('.left-0');
    const ticks = Array.from(blockRail?.children ?? []) as HTMLElement[];
    expect(ticks).toHaveLength(10);
    expect(ticks.filter((tick) => tick.style.background.includes('--rail-new') || tick.style.background.includes('--rail-review'))).toHaveLength(5);
  });
  it('keeps the rail in word units when a review contains minigame interludes', () => {
    const { container } = renderRail([
      {
        key: 'review-0', kind: 'review', done: 10, total: 12, pending: 0, liveRemaining: 2,
        unavailable: 0, gameTotal: 2, gameDone: 1, gameUnavailable: 0,
      },
    ]);

    const ticks = Array.from(container.querySelector('.left-0')?.children ?? []) as HTMLElement[];
    expect(ticks).toHaveLength(12);
    expect(ticks.filter((tick) => tick.style.background.includes('--rail-review'))).toHaveLength(10);
  });

  // The flow steps to the next block on the answer that finishes the current
  // one, so the last new word of a stretch used to empty the block rail and
  // re-label it for the repeats waiting behind the breather — the stretch was
  // never once seen full.
  it('holds the finished stretch on the block rail while the seam is up', () => {
    const finished = block('new-0', 5, 5, 'new');
    const { container, getByText } = renderRail(
      [finished, block('review-1', 0, 5)],
      finished,
    );

    const ticks = Array.from(container.querySelector('.left-0')?.children ?? []) as HTMLElement[];
    expect(ticks).toHaveLength(5);
    expect(ticks.every((tick) => tick.style.background.includes('--rail-new'))).toBe(true);
    expect(getByText('New')).toBeInTheDocument();
  });

  it('hands the block rail back to the flow once the seam is dismissed', () => {
    const { container, getByText } = renderRail([
      block('new-0', 5, 5, 'new'),
      block('review-1', 0, 5),
    ]);

    const ticks = Array.from(container.querySelector('.left-0')?.children ?? []) as HTMLElement[];
    expect(ticks).toHaveLength(5);
    expect(ticks.filter((tick) => tick.style.background.includes('--rail-review'))).toHaveLength(0);
    expect(getByText('Review')).toBeInTheDocument();
  });

  it('names the same-day second pass as a new-word check, not ordinary review', () => {
    const reinforcement = {
      ...block('review-1', 0, 5),
      reinforcement: true,
    };
    const { getByText, queryByText } = renderRail([
      block('new-0', 5, 5, 'new'),
      reinforcement,
    ]);

    expect(getByText('New-word check')).toBeInTheDocument();
    expect(queryByText('Review')).not.toBeInTheDocument();
  });

  it('does not manufacture word progress from skipped minigames', () => {
    const { container } = renderRail([
      {
        key: 'review-0', kind: 'review', done: 0, total: 4, pending: 0, liveRemaining: 4,
        unavailable: 0, gameTotal: 2, gameDone: 0, gameUnavailable: 2,
      },
    ]);

    const ticks = Array.from(container.querySelector('.left-0')?.children ?? []) as HTMLElement[];
    expect(ticks).toHaveLength(4);
    expect(ticks.filter((tick) => tick.style.background.includes('--rail-review'))).toHaveLength(0);
  });
});
