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

  it('draws the day as one review segment, sized by item counts', () => {
    const { container } = renderRail([
      block('new-0', 0, 5, 'new'),
      block('review-0', 0, 6),
      block('new-1', 0, 5, 'new'),
      block('review-1', 0, 4),
    ]);

    // The right-hand rail is the day. Four blocks, three segments: the two
    // review blocks share one, and it is twice as long as either new stretch.
    const dayRail = container.querySelector('.right-0');
    const segments = Array.from(dayRail?.children ?? []) as HTMLElement[];
    expect(segments.map((segment) => segment.style.flexGrow)).toEqual(['5', '10', '5']);
  });
});
