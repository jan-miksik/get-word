import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NormalizedWord } from '@/lib/words';
import { WordAssemblyGame } from '../WordAssemblyGame';

/** Fills the tray in order, then presses the explicit check. */
function assemble(parts: string[]) {
  for (const part of parts) {
    fireEvent.click(screen.getAllByRole('button', { name: part })[0]);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
}

const WORD: NormalizedWord = {
  id: 'assembly-word',
  cz: 'pes',
  vi: 'con chó',
  en: '',
  category: ['word'],
};

describe('WordAssemblyGame', () => {
  it('centres its constrained desktop surface', () => {
    const { container } = render(
      <WordAssemblyGame
        word={WORD}
        role="knownLanguage"
        variant="words"
        answerParts={['con', 'chó']}
        distractorParts={['mèo']}
        onOutcome={vi.fn()}
      />,
    );

    expect(container.querySelector('article')).toHaveClass('mx-auto', 'max-w-2xl');
  });

  it('shows only the circular mark after a correct assembly', () => {
    render(
      <WordAssemblyGame
        word={WORD}
        role="knownLanguage"
        variant="words"
        answerParts={['con', 'chó']}
        distractorParts={['mèo']}
        onOutcome={vi.fn()}
      />,
    );

    assemble(['con', 'chó']);

    expect(screen.getByRole('img', { name: 'Correct!' })).toBeInTheDocument();
    expect(screen.queryByText('✓ Correct!')).not.toBeInTheDocument();
  });

  it('grades nothing until the check is pressed', () => {
    const onOutcome = vi.fn();
    render(
      <WordAssemblyGame
        word={WORD}
        role="knownLanguage"
        variant="words"
        answerParts={['con', 'chó']}
        distractorParts={['mèo']}
        onOutcome={onOutcome}
      />,
    );

    // A full tray on its own is not an answer: the learner still has to be able
    // to reorder what they built before it counts.
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'con' }));
    fireEvent.click(screen.getByRole('button', { name: 'chó' }));
    expect(screen.queryByRole('img', { name: 'Correct!' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('img', { name: 'Correct!' })).toBeInTheDocument();
    expect(onOutcome).not.toHaveBeenCalled();
  });

  it('takes a placed part back when it is tapped again', () => {
    render(
      <WordAssemblyGame
        word={WORD}
        role="knownLanguage"
        variant="words"
        answerParts={['con', 'chó']}
        distractorParts={['mèo']}
        onOutcome={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'con' }));
    fireEvent.click(screen.getByRole('button', { name: 'chó' }));
    expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'chó' }));
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  it('reorders a placed part with the arrow keys', () => {
    render(
      <WordAssemblyGame
        word={WORD}
        role="knownLanguage"
        variant="words"
        answerParts={['con', 'chó']}
        distractorParts={['mèo']}
        onOutcome={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'chó' }));
    fireEvent.click(screen.getByRole('button', { name: 'con' }));
    // Built back to front, then walked into place without a pointer.
    fireEvent.keyDown(screen.getByRole('button', { name: 'con' }), { key: 'ArrowLeft' });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(screen.getByRole('img', { name: 'Correct!' })).toBeInTheDocument();
  });

  it('reorders the answer by dragging one part past another', () => {
    // jsdom gives every element a zero-sized box, so the tray is laid out here:
    // one 50px slot every 60px, in DOM order, which is what the gesture measures.
    const layout = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function box(this: HTMLElement) {
        const index = this.parentElement
          ? [...this.parentElement.children].indexOf(this)
          : 0;
        const left = index * 60;
        return {
          x: left, y: 0, left, top: 0, right: left + 50, bottom: 40,
          width: 50, height: 40, toJSON: () => ({}),
        } as DOMRect;
      });

    try {
      render(
        <WordAssemblyGame
          word={WORD}
          role="knownLanguage"
          variant="words"
          answerParts={['con', 'chó']}
          distractorParts={['mèo']}
          onOutcome={vi.fn()}
        />,
      );

      // Built back to front, then dragged into place.
      fireEvent.click(screen.getByRole('button', { name: 'chó' }));
      fireEvent.click(screen.getByRole('button', { name: 'con' }));

      const dragged = screen.getByRole('button', { name: 'con' });
      fireEvent.pointerDown(dragged, { pointerId: 1, button: 0, clientX: 85, clientY: 20 });
      fireEvent.pointerMove(dragged, { pointerId: 1, clientX: 60, clientY: 20 });
      fireEvent.pointerMove(dragged, { pointerId: 1, clientX: 25, clientY: 20 });
      fireEvent.pointerUp(dragged, { pointerId: 1, clientX: 25, clientY: 20 });

      // Dropping is not answering: the drag must not also count as a tap that
      // takes the part back out of the tray.
      fireEvent.click(dragged);
      fireEvent.click(screen.getByRole('button', { name: 'Check' }));

      expect(screen.getByRole('img', { name: 'Correct!' })).toBeInTheDocument();
    } finally {
      layout.mockRestore();
    }
  });

  it('accepts a repeated letter placed from either of its tiles', () => {
    render(
      <WordAssemblyGame
        word={{ ...WORD, vi: 'kolo' }}
        role="knownLanguage"
        variant="letters:II"
        answerParts={['k', 'o', 'l', 'o']}
        distractorParts={['e']}
        onOutcome={vi.fn()}
      />,
    );

    // The two `o` tiles are interchangeable, so taking the second one first
    // still spells the word — grading on tile identity used to call this wrong.
    const os = screen.getAllByRole('button', { name: 'o' });
    fireEvent.click(screen.getByRole('button', { name: 'k' }));
    fireEvent.click(os[1]);
    fireEvent.click(screen.getByRole('button', { name: 'l' }));
    fireEvent.click(os[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(screen.getByRole('img', { name: 'Correct!' })).toBeInTheDocument();
  });
});


vi.mock('@/lib/audio-availability', () => ({
  getCachedPlayableAudioUrl: () => null,
  getPlayableAudioUrl: (url: string | null) => Promise.resolve(url),
}));

describe('WordAssemblyGame answer audio', () => {
  const SPOKEN_WORD: NormalizedWord = {
    ...WORD,
    czAudio: 'speech/cz/pes.mp3',
    viAudio: 'speech/vi/con-cho.mp3',
  };

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

  function renderGame(word: NormalizedWord) {
    return render(
      <WordAssemblyGame
        word={word}
        role="knownLanguage"
        variant="words"
        answerParts={['con', 'chó']}
        distractorParts={['mèo']}
        onOutcome={vi.fn()}
      />,
    );
  }

  it('offers no audio until the answer has been given', () => {
    renderGame(SPOKEN_WORD);
    expect(screen.queryByRole('button', { name: 'Play audio' })).not.toBeInTheDocument();
  });

  it('plays the target phrase from the audio icon shown after answering', async () => {
    renderGame(SPOKEN_WORD);

    assemble(['con', 'chó']);

    const audioButton = screen.getByRole('button', { name: 'Play audio' });
    expect(audioButton).toHaveClass('h-16', 'w-16', 'absolute', 'right-0');
    fireEvent.click(audioButton);
    await waitFor(() => expect(playCalls).toBe(1));
    expect(audioSources).toContain('/speech/vi/con-cho.mp3');
  });

  it('offers the same audio after a wrong assembly', () => {
    renderGame(SPOKEN_WORD);

    assemble(['mèo', 'con']);

    expect(screen.getByRole('button', { name: 'Play audio' })).toBeInTheDocument();
  });

  it('shows no audio icon for a word with no recording', () => {
    renderGame(WORD);

    assemble(['con', 'chó']);

    expect(screen.queryByRole('button', { name: 'Play audio' })).not.toBeInTheDocument();
  });
});
