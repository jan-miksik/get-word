import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { SessionBreatherCard } from '../SessionBreatherCard';
import { resolveSessionFlow } from '@/features/learning/session/flow';
import type { SessionBlockProgress } from '@/features/learning/session/dayProgress';
import type { NormalizedWord } from '@/lib/words';

const word = (id: string, cz: string, vi: string): NormalizedWord => ({
  id,
  category: ['word'],
  cz,
  en: cz,
  vi,
});

const ANSWERED = [word('w1', 'pes', 'con chó'), word('w2', 'kočka', 'con mèo')];

const between = () => {
  const blocks: SessionBlockProgress[] = [
    { key: 'review-0', kind: 'review', phase: 0, done: 9, total: 10, pending: 0, liveRemaining: 1, unavailable: 0 },
    // The answer that crossed the seam is already the learner's, even while
    // its SRS write is still queued.
    { key: 'new-0', kind: 'new', phase: 1, done: 2, total: 10, pending: 1, liveRemaining: 8, unavailable: 0 },
    { key: 'review-1', kind: 'review', phase: 2, reinforcement: true, done: 0, total: 12, pending: 0, liveRemaining: 12, unavailable: 0 },
  ];
  const flow = resolveSessionFlow(blocks, 2);
  return { finished: blocks[1], next: blocks[2], flow, words: ANSWERED };
};

function renderBetween(props: Partial<React.ComponentProps<typeof SessionBreatherCard>> = {}) {
  return render(
    <I18nProvider language="en">
      <SessionBreatherCard
        breather={between()}
        onContinue={() => {}}
        {...props}
      />
    </I18nProvider>,
  );
}

describe('SessionBreatherCard at the seam between two stretches', () => {
  it('says what the day has amounted to so far, in both units', () => {
    renderBetween();

    expect(screen.getByText('9 words and phrases reviewed')).toBeInTheDocument();
    expect(screen.getByText('3 new words')).toBeInTheDocument();
  });

  it('does not repeat newly added words after their block is complete', () => {
    renderBetween();

    expect(screen.queryByText('Just added')).not.toBeInTheDocument();
    expect(screen.queryByText('pes')).not.toBeInTheDocument();
    expect(screen.queryByText('kočka')).not.toBeInTheDocument();
    expect(screen.queryByText('con chó')).not.toBeInTheDocument();
  });

  it('does not show a just-reviewed label or the reviewed words', () => {
    const reviewBreather = between();
    renderBetween({
      breather: {
        ...reviewBreather,
        finished: { ...reviewBreather.finished, kind: 'review' },
      },
    });

    expect(screen.queryByText('Just reviewed')).not.toBeInTheDocument();
    expect(screen.queryByText('pes')).not.toBeInTheDocument();
    expect(screen.queryByText('kočka')).not.toBeInTheDocument();
  });

  it('drops the item bar on a minutes day, where the countdown already answers it', () => {
    const { container } = renderBetween({ showDayProgress: false });

    expect(container.querySelector('[role="progressbar"]')?.closest('.sr-only')).not.toBeNull();
    expect(screen.queryByText(/left of/i)).not.toBeInTheDocument();
    // The recap is not part of that bargain: it is what the pause is for.
    expect(screen.getByText('9 words and phrases reviewed')).toBeInTheDocument();
  });

  it('offers carrying on and nothing else — the day ends on the deck, not here', () => {
    renderBetween();

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /keep going/i })).toBeInTheDocument();
  });

  it('describes the second pass as checking new words, not ordinary review', () => {
    renderBetween();

    expect(screen.getByText('Now: check new words')).toBeInTheDocument();
    expect(screen.queryByText('Now: review')).not.toBeInTheDocument();
  });
});
