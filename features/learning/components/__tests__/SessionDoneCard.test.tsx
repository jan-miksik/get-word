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
    // The leftovers are named once, on the button that offers them, and the
    // settling words are not named at all while there is real work waiting.
    expect(screen.queryByText(/settling in/i)).not.toBeInTheDocument();

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
    expect(container.querySelector('section')).toHaveClass('max-w-[500px]', 'rounded-[1.75rem]');
  });

  it('reports the day in both units', () => {
    renderCard({ dayFlow: closedDay() });

    expect(screen.getByText('9 words and phrases reviewed')).toBeInTheDocument();
    expect(screen.getByText('3 new words')).toBeInTheDocument();
  });

  it('stamps a completed day with a star inside the ring', () => {
    const { container } = renderCard({ dayFlow: closedDay() });

    expect(container.querySelector('.session-seal-star')).toBeInTheDocument();
    expect(container.querySelector('.session-seal-tick')).not.toBeInTheDocument();
  });

  it('leads with the waiting repeats when the plan left some behind', () => {
    const onStudyExtra = vi.fn();
    renderCard({ dayFlow: closedDay(), dueNowCount: 1, onStudyExtra, onOpenWordChat: vi.fn() });

    expect(screen.getByText(/done for today/i)).toBeInTheDocument();
    // Only the button says what is waiting: the sentence that used to repeat it
    // sat directly above the same words and the same number.
    expect(screen.queryByText(/waiting tomorrow/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/on top of today/i)).not.toBeInTheDocument();

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
  });

  it('does not claim a surplus on a day that only met its goal', () => {
    renderCard({
      dayFlow: closedDay(),
      dayScore: { introduced: 3, reviewed: 9, target: 12 },
    });

    expect(screen.queryByText(/over goal/i)).not.toBeInTheDocument();
  });

  it('does not count a same-day reinforcement pass as review above the goal', () => {
    const flow = resolveSessionFlow([
      {
        key: 'new-0', kind: 'new', done: 7, total: 7, pending: 0,
        liveRemaining: 0, unavailable: 0,
      },
      {
        key: 'review-1', kind: 'review', done: 7, total: 7, pending: 0,
        liveRemaining: 0, unavailable: 0, reinforcement: true,
      },
    ]);

    renderCard({
      dayFlow: flow,
      dayScore: { introduced: 7, reviewed: 0, target: 7, met: true },
    });

    expect(screen.getByText('7 new words')).toBeInTheDocument();
    expect(screen.queryByText(/reviewed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/over goal/i)).not.toBeInTheDocument();
  });

  it('leaves the reinforcement pass to the seam it happened at', () => {
    // Seven new words, each checked once more minutes later. The breather at
    // that seam names the second pass; here it would be a third figure
    // belonging to neither of the other two and to nothing the goal measures,
    // sitting directly above the line comparing the day against that goal.
    const flow = resolveSessionFlow([
      {
        key: 'new-0', kind: 'new', done: 7, total: 7, pending: 0,
        liveRemaining: 0, unavailable: 0,
      },
      {
        key: 'review-1', kind: 'review', done: 7, total: 7, pending: 0,
        liveRemaining: 0, unavailable: 0, reinforcement: true,
      },
    ]);

    renderCard({
      dayFlow: flow,
      dayScore: { introduced: 7, reviewed: 0, target: 7, met: true },
    });

    expect(screen.queryByText(/checked right away/i)).not.toBeInTheDocument();
    expect(screen.getByText("Today's goal: 7 · counted: 7")).toBeInTheDocument();
  });

  it('counts an extra round straight away instead of waiting for the rollup', () => {
    // The bonus round is thrown away the moment it settles, and the server's
    // whole-day figure counts distinct words — so ten more repeats of words
    // already answered today move it by nothing. Counted here, they show up.
    renderCard({
      dayFlow: closedDay(),
      dayScore: { introduced: 3, reviewed: 9, target: 12, met: true },
      extra: { reviewed: 10, fresh: 0 },
    });

    expect(screen.getByText('9 words and phrases reviewed')).toBeInTheDocument();
    expect(screen.getByText('+10 over goal')).toBeInTheDocument();
    expect(screen.getByText("Today's goal: 12 · counted: 12")).toBeInTheDocument();
  });

  it('uses the confirmed day split instead of inflating it from a larger local plan', () => {
    const flow = resolveSessionFlow([
      {
        key: 'review-0', kind: 'review', done: 11, total: 11, pending: 0,
        liveRemaining: 0, unavailable: 0,
      },
      {
        key: 'new-0', kind: 'new', done: 9, total: 9, pending: 0,
        liveRemaining: 0, unavailable: 0,
      },
    ]);

    renderCard({
      dayFlow: flow,
      dayScore: { introduced: 5, reviewed: 15, target: 16, met: true },
      extra: { reviewed: 10, fresh: 0 },
    });

    expect(screen.getByText('5 new words')).toBeInTheDocument();
    expect(screen.getByText('15 words and phrases reviewed')).toBeInTheDocument();
    expect(screen.getByText("Today's goal: 16 · counted: 20")).toBeInTheDocument();
    expect(screen.getByText('+10 over goal')).toBeInTheDocument();
    expect(screen.queryByText('+14 over goal')).not.toBeInTheDocument();
  });

  it('claims no surplus for a day that was only walked as planned', () => {
    // The targets froze at the day's first answer while the reviewed figure is
    // the server's count of the whole day, so the two can drift apart with
    // nobody having done anything extra. A badge congratulating the learner
    // for that drift has nothing behind it.
    renderCard({
      dayFlow: closedDay(),
      dayScore: { introduced: 20, reviewed: 9, target: 12 },
    });

    expect(screen.queryByText(/over goal/i)).not.toBeInTheDocument();
    expect(screen.getByText("Today's goal: 12 · counted: 29")).toBeInTheDocument();
  });

  it('leaves a minutes day without a word tally it has no target for', () => {
    renderCard({ dayFlow: closedDay(), dayScore: { introduced: 3, reviewed: 9, target: null } });

    expect(screen.queryByText(/today's goal:/i)).not.toBeInTheDocument();
  });

  it('includes the final queued answer immediately when the day closes', () => {
    const flow = resolveSessionFlow([
      {
        key: 'new-0', kind: 'new', done: 13, total: 14, pending: 1,
        liveRemaining: 1, unavailable: 0,
      },
    ]);

    renderCard({
      dayFlow: flow,
      dayScore: { introduced: 13, reviewed: 0, target: 14, met: false },
    });

    expect(screen.getByText('14 new words')).toBeInTheDocument();
    expect(screen.queryByText(/over goal/i)).not.toBeInTheDocument();
  });

  it('keeps the plan\'s own count when the server rollup lags behind it', () => {
    renderCard({ dayFlow: closedDay(), dayScore: { introduced: 0, reviewed: 0, target: null } });

    expect(screen.getByText('9 words and phrases reviewed')).toBeInTheDocument();
    expect(screen.getByText('3 new words')).toBeInTheDocument();
  });

  it('never turns an already earned day into out-of-words because this visit ran short', () => {
    renderCard({
      dayFlow: shortDay(),
      shortfall: 12,
      dayScore: { introduced: 13, reviewed: 20, target: 20, met: true },
    });

    expect(screen.getByText(/done for today/i)).toBeInTheDocument();
    expect(screen.queryByText(/out of words/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/daily goal is 12 short/i)).not.toBeInTheDocument();
    expect(screen.getByText('20 words and phrases reviewed')).toBeInTheDocument();
    expect(screen.getByText('13 new words')).toBeInTheDocument();
  });

  it('offers the new words the day never reached instead of pointing at tomorrow', () => {
    const onStudyExtra = vi.fn();
    renderCard({ dayFlow: closedDay(), newNowCount: 15, onStudyExtra });

    expect(screen.queryByText(/waiting tomorrow/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/past today's goal/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /learn 15 more/i }));

    expect(onStudyExtra).toHaveBeenCalledTimes(1);
  });

  it('offers only repeats while both repeats and new words are available', () => {
    const onStudyExtra = vi.fn();
    renderCard({ dayFlow: closedDay(), dueNowCount: 4, newNowCount: 15, onStudyExtra });

    expect(screen.queryByText(/15 new/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /repeat 4 more/i }));

    expect(onStudyExtra).toHaveBeenCalledTimes(1);
  });

  it('does not offer leftovers it has no way to start', () => {
    renderCard({ dayFlow: closedDay(), dueNowCount: 4, newNowCount: 15, onOpenWordChat: vi.fn() });

    expect(screen.getByText(/next batch is waiting tomorrow/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('offers a block of games once the schedule itself is empty', () => {
    const onPractice = vi.fn();
    renderCard({
      dayFlow: closedDay(),
      onPractice,
      practiceSize: 10,
      onOpenWordChat: vi.fn(),
    });

    expect(screen.getByText(/no effect on your repeats/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /keep practising/i }));

    expect(onPractice).toHaveBeenCalledTimes(1);
  });

  it('does not offer the bonus block outside a completed day', () => {
    renderCard({ onPractice: vi.fn(), practiceSize: 10 });

    expect(screen.queryByRole('button', { name: /keep practising/i })).not.toBeInTheDocument();
  });

  it('keeps the block out of the way while real study is still waiting', () => {
    renderCard({
      dayFlow: closedDay(),
      dueNowCount: 4,
      onStudyExtra: vi.fn(),
      onPractice: vi.fn(),
      practiceSize: 10,
    });

    expect(screen.queryByRole('button', { name: /keep practising/i })).not.toBeInTheDocument();
  });

  it('does not offer a game to a day that ran out of words, which needs words', () => {
    renderCard({
      dayFlow: shortDay(),
      shortfall: 6,
      onPractice: vi.fn(),
      practiceSize: 10,
      onOpenWordChat: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: /keep practising/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add words/i })).toBeInTheDocument();
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

  it('keeps the shell full-width while capping the closing modal at 500px', () => {
    const { container } = renderCard({ dayFlow: closedDay() });

    expect(container.firstElementChild).toHaveClass('w-full');
    expect(container.querySelector('section')).toHaveClass('w-full', 'max-w-[500px]');
  });
});
