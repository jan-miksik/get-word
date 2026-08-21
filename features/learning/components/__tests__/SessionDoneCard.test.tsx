import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { SessionDoneCard } from '../SessionDoneCard';

function renderCard(props: Partial<React.ComponentProps<typeof SessionDoneCard>> = {}) {
  return render(
    <I18nProvider language="en">
      <SessionDoneCard settlingCount={0} showNotReady={false} {...props} />
    </I18nProvider>,
  );
}

describe('SessionDoneCard', () => {
  it('offers the settling words as a way to keep studying', () => {
    const onToggleShowNotReady = vi.fn();
    renderCard({ settlingCount: 4, onToggleShowNotReady });

    fireEvent.click(screen.getByRole('button', { name: /practise ahead \(4\)/i }));

    expect(onToggleShowNotReady).toHaveBeenCalledTimes(1);
  });

  it('offers adding words when nothing is settling, so the screen is never a dead end', () => {
    const onOpenWordChat = vi.fn();
    renderCard({ onOpenWordChat });

    expect(screen.queryByRole('button', { name: /practise ahead/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add words/i }));

    expect(onOpenWordChat).toHaveBeenCalledTimes(1);
  });

  it('keeps its own headline out of the way when the caller has a better one', () => {
    renderCard({ title: 'No words match your current filters.' });

    expect(screen.getByText('No words match your current filters.')).toBeInTheDocument();
    expect(screen.queryByText(/nothing due right now/i)).not.toBeInTheDocument();
  });
});
