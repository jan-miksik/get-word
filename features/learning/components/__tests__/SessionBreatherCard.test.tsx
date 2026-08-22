import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { SessionBreatherCard } from '../SessionBreatherCard';
import { resolveSessionFlow } from '@/features/learning/session/flow';
import type { SessionBlockProgress } from '@/features/learning/session/dayProgress';

const doneBlock: SessionBlockProgress = {
  key: 'review-0', kind: 'review', done: 6, total: 6, pending: 0, liveRemaining: 0, unavailable: 0,
};

function renderComplete(props: Partial<React.ComponentProps<typeof SessionBreatherCard>> = {}) {
  const flow = resolveSessionFlow([doneBlock]);
  return render(
    <I18nProvider language="en">
      <SessionBreatherCard
        breather={{ kind: 'complete', flow }}
        onContinue={() => {}}
        {...props}
      />
    </I18nProvider>,
  );
}

describe('SessionBreatherCard on a closed day', () => {
  it('offers the waiting repeats as its one button, saying how many and why', () => {
    const onContinueExtra = vi.fn();
    renderComplete({ extraReviewCount: 36, onContinueExtra });

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /repeat 36 more.*they're ready when you are/i }));

    expect(onContinueExtra).toHaveBeenCalledTimes(1);
  });

  it('keeps a way out that does not start more work', () => {
    const onContinue = vi.fn();
    renderComplete({ extraReviewCount: 36, onContinueExtra: vi.fn(), onContinue });

    fireEvent.click(screen.getByRole('button', { name: /that's enough for today/i }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('closes on a single button when nothing is left to repeat', () => {
    renderComplete();

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /that's enough for today/i })).toBeInTheDocument();
  });
});
