import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { SessionDoneCard } from '../SessionDoneCard';
import { resolveSessionFlow } from '@/features/learning/session/flow';
import type { SessionBlockProgress } from '@/features/learning/session/dayProgress';

function renderCard(props: Partial<React.ComponentProps<typeof SessionDoneCard>> = {}) {
  return render(
    <I18nProvider language="en">
      <SessionDoneCard settlingCount={0} {...props} />
    </I18nProvider>,
  );
}

/** A day whose plan is walked to the end. */
const closedDay = () => {
  const blocks: SessionBlockProgress[] = [
    { key: 'review-0', kind: 'review', done: 9, total: 9, pending: 0, liveRemaining: 0, unavailable: 0 },
    { key: 'new-0', kind: 'new', done: 3, total: 3, pending: 0, liveRemaining: 0, unavailable: 0 },
  ];
  return resolveSessionFlow(blocks);
};

/** A day that ran out of material before it reached the goal. */
const shortDay = () => {
  const blocks: SessionBlockProgress[] = [
    { key: 'review-0', kind: 'review', done: 4, total: 4, pending: 0, liveRemaining: 0, unavailable: 0 },
  ];
  return resolveSessionFlow(blocks);
};

describe('SessionDoneCard on an emptied deck', () => {
  it('names the settling words without offering to pull them forward', () => {
    renderCard({ settlingCount: 4, onOpenWordChat: vi.fn() });

    expect(screen.getByText(/4 words are settling in/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /practise ahead/i })).not.toBeInTheDocument();
  });

  it('counts a single settling word in the singular', () => {
    renderCard({ settlingCount: 1 });

    expect(screen.getByText('1 word is settling in before its next repeat.')).toBeInTheDocument();
  });

  it('offers adding words, so the screen is never a dead end', () => {
    const onOpenWordChat = vi.fn();
    renderCard({ onOpenWordChat });

    fireEvent.click(screen.getByRole('button', { name: /add words/i }));

    expect(onOpenWordChat).toHaveBeenCalledTimes(1);
  });

  it('does not offer Photo Lab after completing the day', () => {
    renderCard();

    expect(screen.queryByRole('button', { name: /take a photo/i })).not.toBeInTheDocument();
  });

  it('never claims nothing is due while the plan\'s leftover repeats are waiting', () => {
    const onStudyExtra = vi.fn();
    renderCard({ settlingCount: 127, dueNowCount: 36, onStudyExtra });

    expect(screen.queryByText(/nothing due right now/i)).not.toBeInTheDocument();
    expect(screen.getByText(/done for today/i)).toBeInTheDocument();
    expect(screen.getByText(/36 words are ready for a repeat right now/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /repeat 36 more/i }));

    expect(onStudyExtra).toHaveBeenCalledTimes(1);
  });

  it('keeps its own headline out of the way when the caller has a better one', () => {
    renderCard({ title: 'No words match your current filters.' });

    expect(screen.getByText('No words match your current filters.')).toBeInTheDocument();
    expect(screen.queryByText(/nothing due right now/i)).not.toBeInTheDocument();
  });
});

describe('SessionDoneCard closing the day', () => {
  it('closes the day here rather than as a card to dismiss first', () => {
    const { container } = renderCard({ dayFlow: closedDay(), onOpenWordChat: vi.fn() });

    expect(screen.getByText(/done for today/i)).toBeInTheDocument();
    expect(screen.getByText(/next batch is waiting tomorrow/i)).toBeInTheDocument();
    // Nothing to acknowledge: the only button is a way on, not a way out.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /add words/i })).toBeInTheDocument();
    expect(container.querySelector('section')).toHaveClass('max-w-none', 'rounded-[1.75rem]');
  });

  it('reports the day in both units, and what it cost', () => {
    renderCard({
      dayFlow: closedDay(),
      dayResult: { activeMs: 512_000, itemsDone: 12, secondsPerItem: 11.6 },
    });

    expect(screen.getByText('9 words and phrases reviewed')).toBeInTheDocument();
    expect(screen.getByText('3 new words')).toBeInTheDocument();
    expect(screen.getByText(/12s per word/i)).toBeInTheDocument();
  });

  it('leads with the waiting repeats when the plan left some behind', () => {
    const onStudyExtra = vi.fn();
    renderCard({ dayFlow: closedDay(), dueNowCount: 1, onStudyExtra, onOpenWordChat: vi.fn() });

    expect(screen.getByText(/done for today/i)).toBeInTheDocument();
    expect(screen.getByText('1 word is ready for a repeat right now, on top of today\'s goal.')).toBeInTheDocument();
    expect(screen.queryByText(/waiting tomorrow/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /repeat 1 more/i }));

    expect(onStudyExtra).toHaveBeenCalledTimes(1);
  });

  it('counts the day the server counted, not the cap the plan stopped at', () => {
    // The goal asked for 5 new words; the learner went on and did 20. A recap
    // read off the plan alone would hand them their own goal back.
    renderCard({
      dayFlow: closedDay(),
      dayScore: { introduced: 20, reviewed: 9, target: 12 },
    });

    expect(screen.getByText('20 new words')).toBeInTheDocument();
    expect(screen.queryByText('3 new words')).not.toBeInTheDocument();
    expect(screen.getByText('+17 over goal')).toBeInTheDocument();
  });

  it('does not claim a surplus on a day that only met its goal', () => {
    renderCard({
      dayFlow: closedDay(),
      dayScore: { introduced: 3, reviewed: 9, target: 12 },
    });

    expect(screen.queryByText(/over goal/i)).not.toBeInTheDocument();
  });

  it('keeps the plan\'s own count when the server rollup lags behind it', () => {
    renderCard({ dayFlow: closedDay(), dayScore: { introduced: 0, reviewed: 0, target: null } });

    expect(screen.getByText('9 words and phrases reviewed')).toBeInTheDocument();
    expect(screen.getByText('3 new words')).toBeInTheDocument();
  });

  it('offers the new words the day never reached instead of pointing at tomorrow', () => {
    const onStudyExtra = vi.fn();
    renderCard({ dayFlow: closedDay(), newNowCount: 15, onStudyExtra });

    expect(screen.queryByText(/waiting tomorrow/i)).not.toBeInTheDocument();
    expect(screen.getByText(/15 new words are ready, past today's goal/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /learn 15 more/i }));

    expect(onStudyExtra).toHaveBeenCalledTimes(1);
  });

  it('rolls repeats and new words into the one opt-in that covers both', () => {
    const onStudyExtra = vi.fn();
    renderCard({ dayFlow: closedDay(), dueNowCount: 4, newNowCount: 15, onStudyExtra });

    expect(screen.getByText(/4 are ready for a repeat and 15 are new/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /keep going.*19 more/i }));

    expect(onStudyExtra).toHaveBeenCalledTimes(1);
  });

  it('does not offer leftovers it has no way to start', () => {
    renderCard({ dayFlow: closedDay(), dueNowCount: 4, newNowCount: 15, onOpenWordChat: vi.fn() });

    expect(screen.getByText(/next batch is waiting tomorrow/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('does not celebrate a day that merely ran out of words', () => {
    const onOpenWordChat = vi.fn();
    renderCard({ dayFlow: shortDay(), shortfall: 6, onOpenWordChat });

    expect(screen.getByText(/out of words/i)).toBeInTheDocument();
    expect(screen.getByText(/goal is 6 short/i)).toBeInTheDocument();
    expect(screen.queryByText(/done for today/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add words/i }));

    expect(onOpenWordChat).toHaveBeenCalledTimes(1);
  });
});
