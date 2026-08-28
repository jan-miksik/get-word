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

function renderRail(blocks: SessionBlockProgress[]) {
  return render(
    <I18nProvider language="en">
      <SessionRail flow={resolveSessionFlow(blocks)} />
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

  // The block rail counts ticks. Items the block planned but the stream cannot
  // serve used to get a tick each, so the rail was still short of the top on the
  // answer that actually finished the block.
  it('counts only the items the block can still serve', () => {
    const { container } = renderRail([
      { key: 'review-0', kind: 'review', done: 2, total: 6, pending: 0, liveRemaining: 1, unavailable: 3 },
    ]);

    const blockRail = container.querySelector('.left-0');
    const ticks = Array.from(blockRail?.children ?? []) as HTMLElement[];
    expect(ticks).toHaveLength(3);
    expect(ticks.filter((tick) => tick.style.background.includes('--rail-new') || tick.style.background.includes('--rail-review'))).toHaveLength(2);
  });
  // Every card in the stretch gets a tick, minigames included: a rail that
  // stood still through a matching round read as a session that had stopped
  // counting. The day's goal is untouched — that is counted in words.
  it('gives each minigame round its own tick and fills it when the round is played', () => {
    const { container } = renderRail([
      {
        key: 'review-0', kind: 'review', done: 2, total: 4, pending: 0, liveRemaining: 2,
        unavailable: 0, gameTotal: 2, gameDone: 1, gameUnavailable: 0,
      },
    ]);

    const ticks = Array.from(container.querySelector('.left-0')?.children ?? []) as HTMLElement[];
    expect(ticks).toHaveLength(6);
    expect(ticks.filter((tick) => tick.style.background.includes('--rail-review'))).toHaveLength(3);
  });

  it('drops the tick of a round the learner walked away from', () => {
    const { container } = renderRail([
      {
        key: 'review-0', kind: 'review', done: 0, total: 4, pending: 0, liveRemaining: 4,
        unavailable: 0, gameTotal: 2, gameDone: 0, gameUnavailable: 2,
      },
    ]);

    expect(Array.from(container.querySelector('.left-0')?.children ?? [])).toHaveLength(4);
  });
});
