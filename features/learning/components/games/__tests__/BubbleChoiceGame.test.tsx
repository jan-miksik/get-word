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

describe('BubbleChoiceGame field stability', () => {
  afterEach(() => vi.useRealTimers());

  function bubbleLabels(): string[] {
    return screen
      .getAllByRole('button')
      .map((button) => button.textContent ?? '')
      .filter((label) => label.startsWith('learning-'));
  }

  function promptWord(): NormalizedWord {
    const found = words.find((word) => screen.queryByText(word.cz));
    expect(found).toBeDefined();
    return found!;
  }

  it('removes only the answered bubble and leaves the rest of the field alone', () => {
    vi.useFakeTimers();
    render(
      <BubbleChoiceGame words={words} role="knownLanguage" onScore={vi.fn()} onComplete={vi.fn()} />,
    );

    const before = bubbleLabels();
    const answered = promptWord();
    expect(before).toHaveLength(words.length);

    fireEvent.click(screen.getByRole('button', { name: answered.vi }));
    act(() => vi.advanceTimersByTime(800));

    expect(bubbleLabels()).toEqual(before.filter((label) => label !== answered.vi));
    expect(promptWord().id).not.toBe(answered.id);
  });

  it('does not remove a bubble on a wrong answer', () => {
    vi.useFakeTimers();
    render(
      <BubbleChoiceGame words={words} role="knownLanguage" onScore={vi.fn()} onComplete={vi.fn()} />,
    );

    const before = bubbleLabels();
    const answered = promptWord();
    const wrong = words.find((word) => word.id !== answered.id)!;

    fireEvent.click(screen.getByRole('button', { name: wrong.vi }));
    act(() => vi.advanceTimersByTime(800));

    expect(bubbleLabels()).toEqual(before);
    expect(promptWord().id).toBe(answered.id);
  });

  it('counts down the bubbles still to clear', () => {
    vi.useFakeTimers();
    render(
      <BubbleChoiceGame words={words} role="knownLanguage" onScore={vi.fn()} onComplete={vi.fn()} />,
    );

    expect(screen.getByRole('img', { name: `${words.length}/${words.length}` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: promptWord().vi }));
    act(() => vi.advanceTimersByTime(800));
    expect(screen.getByRole('img', { name: `${words.length - 1}/${words.length}` })).toBeTruthy();
  });
});
