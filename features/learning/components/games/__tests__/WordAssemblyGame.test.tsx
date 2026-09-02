import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    expect(container.querySelector('article')).toHaveClass('mx-auto', 'max-w-2xl', 'flex-1');
  });

  it('keeps the mobile action dock below the tile content', () => {
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

    const content = container.querySelector('[data-assembly-content]');
    const dock = container.querySelector('[data-assembly-action-dock]');
    expect(content?.nextElementSibling).toBe(dock);
    expect(dock).toHaveClass('shrink-0');
    expect(dock).toContainElement(screen.getByRole('button', { name: 'Check' }));
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

  // A wrong assembly used to turn every tile red, which says only "not that" —
  // the learner still had to diff their own word against the answer printed
  // below. Only the parts actually out of place are called out now.
  it('marks only the misplaced parts after a wrong assembly', () => {
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

    // "con" lands in its own slot; "mèo" takes the slot "chó" should have.
    fireEvent.click(screen.getByRole('button', { name: 'con' }));
    fireEvent.click(screen.getByRole('button', { name: 'mèo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(screen.getByRole('button', { name: 'con' }).className).toContain('bg-wash-moss');
    expect(screen.getByRole('button', { name: 'con' }).className).not.toContain('bg-wash-brick');
    expect(screen.getByRole('button', { name: 'mèo' }).className).toContain('bg-wash-brick');
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

  it.each([
    {
      label: 'word',
      variant: 'words',
      answerParts: ['con', 'chó'],
      placedParts: ['chó', 'con'],
      draggedPart: 'con',
    },
    {
      label: 'letter',
      variant: 'letters:II',
      answerParts: ['k', 'o'],
      placedParts: ['o', 'k'],
      draggedPart: 'k',
    },
  ])('restores the landing transition before a dropped $label settles', ({
    variant,
    answerParts,
    placedParts,
    draggedPart,
  }) => {
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
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    try {
      render(
        <WordAssemblyGame
          word={WORD}
          role="knownLanguage"
          variant={variant}
          answerParts={answerParts}
          distractorParts={[]}
          onOutcome={vi.fn()}
        />,
      );

      for (const part of placedParts) {
        fireEvent.click(screen.getByRole('button', { name: part }));
      }
      const dragged = screen.getByRole('button', { name: draggedPart });
      fireEvent.pointerDown(dragged, { pointerId: 1, button: 0, clientX: 85, clientY: 20 });
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 25, clientY: 20 });
      expect(dragged.style.transitionProperty).toBe('none');

      fireEvent.pointerUp(window, { pointerId: 1, clientX: 25, clientY: 20 });

      // The tile remains at the pointer for one frame, but unlike the active
      // drag that frame must already allow a transform transition. Otherwise
      // clearing the offset below is an immediate visual jump.
      expect(dragged.style.transform).toContain('translate(');
      expect(dragged.style.transitionProperty).toBe('transform');
      expect(frames).toHaveLength(1);
    } finally {
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
      layout.mockRestore();
    }
  });

  it('drops a neighbour into its committed slot without a sideways twitch', () => {
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
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    try {
      render(
        <WordAssemblyGame
          word={WORD}
          role="knownLanguage"
          variant="words"
          answerParts={['con', 'chó']}
          distractorParts={[]}
          onOutcome={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'chó' }));
      fireEvent.click(screen.getByRole('button', { name: 'con' }));

      const dragged = screen.getByRole('button', { name: 'con' });
      const neighbour = screen.getByRole('button', { name: 'chó' });
      fireEvent.pointerDown(dragged, { pointerId: 1, button: 0, clientX: 85, clientY: 20 });
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 25, clientY: 20 });

      // Mid-drag the neighbour is carried to the slot it is about to occupy,
      // and it glides there.
      expect(neighbour.style.transform).toContain('translate(');
      expect(neighbour.style.transitionProperty).toBe('');

      fireEvent.pointerUp(window, { pointerId: 1, clientX: 25, clientY: 20 });

      // On the release frame the flow slot and the offset swap roles. The
      // offset has to vanish outright: transitioning it away would start the
      // neighbour a full slot past where it already sits and slide it back.
      expect(neighbour.style.transform).toBe('');
      expect(neighbour.style.transitionProperty).toBe('none');

      act(() => { frames[0]?.(0); });
      expect(neighbour.style.transform).toBe('');
      expect(neighbour.style.transitionProperty).toBe('');
    } finally {
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
      layout.mockRestore();
    }
  });

  it('keeps dragging while the pointer crosses multiple neighbours', () => {
    // A pointer stops targeting the pressed tile as it crosses the row. The
    // drag has to survive that, so every move here arrives on the window
    // instead of on the tile.
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
          answerParts={['con', 'chó', 'mèo']}
          distractorParts={[]}
          onOutcome={vi.fn()}
        />,
      );

      // Placed backwards, so 'con' has to travel the whole tray, past two
      // neighbours — exactly the drag that used to stop after one step.
      for (const part of ['chó', 'mèo', 'con']) {
        fireEvent.click(screen.getByRole('button', { name: part }));
      }
      const dragged = screen.getByRole('button', { name: 'con' });
      const tray = dragged.parentElement as HTMLElement;
      fireEvent.pointerDown(dragged, { pointerId: 1, button: 0, clientX: 145, clientY: 20 });
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 120, clientY: 20 });
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 60, clientY: 20 });
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 25, clientY: 20 });

      // While held, the tray's flow order is deliberately frozen. The visual
      // gap is made with one-slot transforms; repeatedly reflowing this DOM was
      // what compounded the siblings' in-flight FLIP offsets and flung them out
      // of the tray.
      expect([...tray.querySelectorAll('button')]).toEqual([
        screen.getByRole('button', { name: 'chó' }),
        screen.getByRole('button', { name: 'mèo' }),
        dragged,
      ]);
      fireEvent.pointerUp(window, { pointerId: 1, clientX: 25, clientY: 20 });

      expect([...tray.querySelectorAll('button')]).toEqual([
        dragged,
        screen.getByRole('button', { name: 'chó' }),
        screen.getByRole('button', { name: 'mèo' }),
      ]);

      fireEvent.click(screen.getByRole('button', { name: 'Check' }));

      expect(screen.getByRole('img', { name: 'Correct!' })).toBeInTheDocument();
    } finally {
      layout.mockRestore();
    }
  });

  it('ignores the click a finished drag leaves behind on another tile', () => {
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

      fireEvent.click(screen.getByRole('button', { name: 'chó' }));
      fireEvent.click(screen.getByRole('button', { name: 'con' }));
      const dragged = screen.getByRole('button', { name: 'con' });
      fireEvent.pointerDown(dragged, { pointerId: 1, button: 0, clientX: 85, clientY: 20 });
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 25, clientY: 20 });
      fireEvent.pointerUp(window, { pointerId: 1, clientX: 25, clientY: 20 });

      // The release lands over the neighbour, whose click must not pull it back
      // out of the tray.
      fireEvent.click(screen.getByRole('button', { name: 'chó' }));
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

  it('speaks the target phrase as soon as the answer is checked', async () => {
    renderGame(SPOKEN_WORD);

    assemble(['con', 'chó']);

    await waitFor(() => expect(playCalls).toBe(1));
    expect(audioSources).toContain('/speech/vi/con-cho.mp3');
  });

  it('stays silent on check when the card is muted', () => {
    localStorage.setItem('get-word-skip-sound', 'true');
    renderGame(SPOKEN_WORD);

    assemble(['con', 'chó']);

    expect(playCalls).toBe(0);
    localStorage.removeItem('get-word-skip-sound');
  });

  it('plays the target phrase again from the audio icon shown after answering', async () => {
    renderGame(SPOKEN_WORD);

    assemble(['con', 'chó']);
    await waitFor(() => expect(playCalls).toBe(1));

    const audioButton = screen.getByRole('button', { name: 'Play audio' });
    const audioRow = audioButton.parentElement;
    expect(audioButton).toHaveClass('h-16', 'w-16');
    expect(audioButton).not.toHaveClass('absolute');
    expect(audioRow).toHaveAttribute('data-assembly-audio-row');
    expect(audioRow).toHaveClass('w-full', 'justify-end');
    expect(audioRow?.parentElement).toHaveAttribute('data-assembly-action-dock');
    fireEvent.click(audioButton);
    await waitFor(() => expect(playCalls).toBe(2));
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
