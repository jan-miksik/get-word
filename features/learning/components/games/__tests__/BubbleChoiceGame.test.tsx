import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NormalizedWord } from '@/lib/words';
import { BubbleChoiceGame } from '../BubbleChoiceGame';

const words: NormalizedWord[] = Array.from({ length: 6 }, (_, index) => ({
  id: `word-${index}`,
  cz: `known-${index}`,
  vi: `learning-${index}`,
  en: '',
  category: [],
}));

describe('BubbleChoiceGame review reporting', () => {
  afterEach(() => vi.useRealTimers());

  it('reports at most one unknown outcome for repeated wrong guesses in a round', () => {
    vi.useFakeTimers();
    const onReviewOutcome = vi.fn();
    render(
      <BubbleChoiceGame
        words={words}
        role="knownLanguage"
        onScore={vi.fn()}
        onReviewOutcome={onReviewOutcome}
        onComplete={vi.fn()}
      />,
    );

    const prompt = words.find((word) => screen.queryByText(word.cz));
    expect(prompt).toBeDefined();
    const wrongAnswers = words.filter((word) => word.id !== prompt!.id);

    fireEvent.click(screen.getByRole('button', { name: wrongAnswers[0].vi }));
    act(() => vi.advanceTimersByTime(650));
    fireEvent.click(screen.getByRole('button', { name: wrongAnswers[1].vi }));

    expect(onReviewOutcome).toHaveBeenCalledTimes(1);
    expect(onReviewOutcome).toHaveBeenCalledWith(prompt!.id, 'unknown');
  });
});
