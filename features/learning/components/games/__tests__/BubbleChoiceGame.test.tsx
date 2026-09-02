import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

  it('hands over to the next card once the field is cleared, with no end screen', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(
      <BubbleChoiceGame words={words} role="knownLanguage" onScore={vi.fn()} onComplete={onComplete} />,
    );

    for (let index = 0; index < words.length; index += 1) {
      expect(onComplete).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: promptWord().vi }));
      act(() => vi.advanceTimersByTime(800));
    }

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('swaps the prompt strip for a finish mark once the field is cleared', () => {
    vi.useFakeTimers();
    render(
      <BubbleChoiceGame words={words} role="knownLanguage" onScore={vi.fn()} onComplete={vi.fn()} />,
    );

    for (let index = 0; index < words.length; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: promptWord().vi }));
      act(() => vi.advanceTimersByTime(800));
    }

    // The counter and the word to find both belong to a question that no longer
    // exists — and the tap-to-continue bar lands exactly where they were.
    expect(screen.queryByRole('img', { name: `0/${words.length}` })).toBeNull();
    expect(document.querySelector('[data-success-mark]')).not.toBeNull();
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

  it('keeps the moving field below the top control lane', () => {
    const { container } = render(
      <BubbleChoiceGame words={words} role="knownLanguage" onScore={vi.fn()} onComplete={vi.fn()} />,
    );

    expect(container.querySelector('[data-bubble-field]')).toHaveClass('mt-14');
  });

  it('does not schedule physics while a virtualized round is inactive', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(360);
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(520);
    const requestFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1);

    render(
      <BubbleChoiceGame
        words={words}
        role="knownLanguage"
        isActive={false}
        onScore={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    expect(requestFrame).not.toHaveBeenCalled();
    expect(width).toHaveBeenCalled();
    expect(height).toHaveBeenCalled();
  });
});


vi.mock('@/lib/audio-availability', () => ({
  getCachedPlayableAudioUrl: () => null,
  getPlayableAudioUrl: (url: string | null) => Promise.resolve(url),
}));

describe('BubbleChoiceGame audio', () => {
  const spokenWords: NormalizedWord[] = words.map((word, index) => ({
    ...word,
    czAudio: `speech/cz/known-${index}.mp3`,
    viAudio: `speech/vi/learning-${index}.mp3`,
  }));

  let playCalls = 0;
  let audioSources: string[] = [];

  beforeEach(() => {
    playCalls = 0;
    audioSources = [];
    vi.stubGlobal(
      'Audio',
      vi.fn().mockImplementation(function FakeAudio(
        this: { play: () => Promise<void>; pause: () => void },
        src: string,
      ) {
        audioSources.push(src);
        this.play = () => {
          playCalls += 1;
          return Promise.resolve();
        };
        this.pause = () => {};
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  function promptWord(): NormalizedWord {
    const found = spokenWords.find((word) => screen.queryByText(word.cz));
    expect(found).toBeDefined();
    return found!;
  }

  it('speaks the popped word when the card sound setting is on', async () => {
    render(
      <BubbleChoiceGame
        words={spokenWords}
        role="knownLanguage"
        soundEnabled
        onScore={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    const answered = promptWord();
    fireEvent.click(screen.getByRole('button', { name: answered.vi }));

    await waitFor(() => expect(playCalls).toBe(1));
    const index = spokenWords.indexOf(answered);
    expect(audioSources).toContain(`/speech/vi/learning-${index}.mp3`);
  });

  it('stays silent when the learner has turned the card sound off', async () => {
    render(
      <BubbleChoiceGame
        words={spokenWords}
        role="knownLanguage"
        onScore={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: promptWord().vi }));

    await Promise.resolve();
    expect(playCalls).toBe(0);
  });

  it('stays silent on a wrong bubble', async () => {
    vi.useFakeTimers();
    render(
      <BubbleChoiceGame
        words={spokenWords}
        role="knownLanguage"
        soundEnabled
        onScore={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    const answered = promptWord();
    const wrong = spokenWords.find((word) => word.id !== answered.id)!;
    fireEvent.click(screen.getByRole('button', { name: wrong.vi }));
    act(() => vi.advanceTimersByTime(800));

    expect(playCalls).toBe(0);
    vi.useRealTimers();
  });
});
