import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NormalizedWord } from '@/lib/words';
import { WordAssemblyGame } from '../WordAssemblyGame';

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

    fireEvent.click(screen.getByRole('button', { name: 'con' }));
    fireEvent.click(screen.getByRole('button', { name: 'chó' }));

    expect(screen.getByRole('img', { name: 'Correct!' })).toBeInTheDocument();
    expect(screen.queryByText('✓ Correct!')).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'con' }));
    fireEvent.click(screen.getByRole('button', { name: 'chó' }));

    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    await waitFor(() => expect(playCalls).toBe(1));
    expect(audioSources).toContain('/speech/vi/con-cho.mp3');
  });

  it('offers the same audio after a wrong assembly', () => {
    renderGame(SPOKEN_WORD);

    fireEvent.click(screen.getByRole('button', { name: 'mèo' }));
    fireEvent.click(screen.getByRole('button', { name: 'con' }));

    expect(screen.getByRole('button', { name: 'Play audio' })).toBeInTheDocument();
  });

  it('shows no audio icon for a word with no recording', () => {
    renderGame(WORD);

    fireEvent.click(screen.getByRole('button', { name: 'con' }));
    fireEvent.click(screen.getByRole('button', { name: 'chó' }));

    expect(screen.queryByRole('button', { name: 'Play audio' })).not.toBeInTheDocument();
  });
});
