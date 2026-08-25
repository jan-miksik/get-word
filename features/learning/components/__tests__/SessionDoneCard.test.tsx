import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { SessionDoneCard } from '../SessionDoneCard';

function renderCard(props: Partial<React.ComponentProps<typeof SessionDoneCard>> = {}) {
  return render(
    <I18nProvider language="en">
      <SessionDoneCard settlingCount={0} {...props} />
    </I18nProvider>,
  );
}

describe('SessionDoneCard', () => {
  it('names the settling words without offering to pull them forward', () => {
    renderCard({ settlingCount: 4, onOpenWordChat: vi.fn() });

    expect(screen.getByText(/4 words are settling in/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /practise ahead/i })).not.toBeInTheDocument();
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
