import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  MiniGameCard,
  getDeterministicSourceLangForGameId,
  shouldUseDeterministicAudioPromptForGameId,
} from '../MiniGameCard';
import {
  checkAudioUrlAvailable,
  clearAudioAvailabilityCache,
} from '@/lib/audio-availability';
import type { MiniGameConfig } from '@/features/learning/minigames';
import type { NormalizedWord } from '@/lib/words';

const makeWord = (id: string, cz: string, vi: string): NormalizedWord => ({
  id,
  cz,
  vi,
  en: '',
  category: ['word'],
  czAudio: '/speech/cz/sample.mp3',
  viAudio: '/speech/vi/sample.mp3',
});

const WORDS = [
  makeWord('a', 'pes', 'con chó'),
  makeWord('b', 'kočka', 'con mèo'),
  makeWord('c', 'auto', 'xe hơi'),
  makeWord('d', 'voda', 'nước'),
];

const config = (gameType: MiniGameConfig['gameType']): MiniGameConfig => ({
  _isMinigame: true,
  id: `test-${gameType}`,
  gameType,
  words: WORDS,
});

beforeEach(() => {
  clearAudioAvailabilityCache();
  localStorage.clear();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  vi.stubGlobal(
    'Audio',
    vi.fn().mockImplementation(function FakeAudio(this: { play: () => Promise<void>; pause: () => void }) {
      this.play = () => Promise.resolve();
      this.pause = () => {};
    }),
  );
  global.fetch = vi.fn(async () => new Response(null, { status: 200 }));
});

describe('MiniGameCard', () => {
  it('source language selection is deterministic per game id', () => {
    const a1 = getDeterministicSourceLangForGameId('game-a');
    const a2 = getDeterministicSourceLangForGameId('game-a');
    expect(a1).toBe(a2);

    const differentId = Array.from({ length: 20 }, (_, idx) => `game-b-${idx}`).find(
      (id) => getDeterministicSourceLangForGameId(id) !== a1,
    );
    expect(differentId).toBeDefined();
  });

  it('renders MultipleChoiceGame for multipleChoice type', async () => {
    render(<MiniGameCard config={config('multipleChoice')} role="knownLanguage" onDismiss={vi.fn()} />);
    const shouldUseAudio = shouldUseDeterministicAudioPromptForGameId('test-multipleChoice');
    expect(await screen.findByText(shouldUseAudio ? '🎯 Choose' : '🎯 Choice')).toBeInTheDocument();
  });

  it('renders TypingChallengeGame for typing type', async () => {
    render(<MiniGameCard config={config('typing')} role="knownLanguage" onDismiss={vi.fn()} />);
    expect(await screen.findByText('⌨️ Type in Vietnamese')).toBeInTheDocument();
  });

  it('uses the selected word-list language in typing games', async () => {
    const germanFrenchWords = WORDS.map((word) => ({
      ...word,
      languageFrom: 'de',
      languageTo: 'fr',
    }));

    render(
      <MiniGameCard
        config={{ ...config('typing'), words: germanFrenchWords }}
        role="knownLanguage"
        onDismiss={vi.fn()}
      />,
    );

    expect(await screen.findByText('⌨️ Type in French')).toBeInTheDocument();
    expect(screen.queryByText('⌨️ Type in Vietnamese')).not.toBeInTheDocument();
  });

  it('renders MatchingPairsGame for matching type', async () => {
    render(<MiniGameCard config={config('matching')} role="knownLanguage" onDismiss={vi.fn()} />);
    // Frameless in the stream, so the round carries the same quiet heading the
    // assembly card does rather than the bordered pill.
    expect(await screen.findByText('Match')).toBeInTheDocument();
  });

  it('renders TiltChoiceGame for tiltChoice type', async () => {
    render(
      <MiniGameCard
        config={{ ...config('tiltChoice'), words: WORDS.slice(0, 2) }}
        role="knownLanguage"
        onDismiss={vi.fn()}
      />,
    );
    expect(await screen.findByText(/tilt to choose/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'con chó' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'con mèo' })).toBeInTheDocument();
  });

  it('passes role to the game component', async () => {
    render(<MiniGameCard config={config('multipleChoice')} role="languageToLearn" onDismiss={vi.fn()} />);
    const shouldUseAudio = shouldUseDeterministicAudioPromptForGameId('test-multipleChoice');
    const sourceLang = shouldUseAudio ? 'cz' : getDeterministicSourceLangForGameId('test-multipleChoice');
    const expectedOption = sourceLang === 'cz' ? 'con chó' : 'pes';
    expect(await screen.findByText(expectedOption)).toBeInTheDocument();
  });

  it('uses deterministic prompt mode for matching cards', async () => {
    render(<MiniGameCard config={config('matching')} role="knownLanguage" onDismiss={vi.fn()} />);
    const shouldUseAudio = shouldUseDeterministicAudioPromptForGameId('test-matching');
    if (shouldUseAudio) {
      expect(await screen.findByRole('button', { name: /play 1/i })).toBeInTheDocument();
      expect(screen.queryByText('pes')).not.toBeInTheDocument();
    } else {
      expect(await screen.findByText('pes')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /play 1/i })).not.toBeInTheDocument();
    }
  });

  it('in sound mode, falls back to Vietnamese audio when Czech audio is missing', async () => {
    expect(shouldUseDeterministicAudioPromptForGameId('audio-c')).toBe(true);

    const fallbackWords: NormalizedWord[] = WORDS.map((word) => ({
      ...word,
      czAudio: undefined,
      viAudio: '/speech/vi/sample.mp3',
    }));
    render(
      <MiniGameCard
        config={{ ...config('multipleChoice'), id: 'audio-c', words: fallbackWords }}
        role="knownLanguage"
        onDismiss={vi.fn()}
      />
    );
    expect(await screen.findByText('🎯 Choose')).toBeInTheDocument();
    expect(screen.getByText('pes')).toBeInTheDocument();
  });

  it('in sound mode for matching, tries Vietnamese audio when Czech audio set is incomplete', async () => {
    expect(shouldUseDeterministicAudioPromptForGameId('audio-c')).toBe(true);

    const fallbackWords: NormalizedWord[] = WORDS.map((word) => ({
      ...word,
      czAudio: undefined,
      viAudio: '/speech/vi/sample.mp3',
    }));
    render(
      <MiniGameCard
        config={{ ...config('matching'), id: 'audio-c', words: fallbackWords }}
        role="knownLanguage"
        onDismiss={vi.fn()}
      />
    );
    expect(await screen.findByRole('button', { name: /play 1/i })).toBeInTheDocument();
    expect(screen.getByText('pes')).toBeInTheDocument();
    expect(screen.queryByText('con chó')).not.toBeInTheDocument();
  });

  it('passes onResult to the game component and calls it on answer', async () => {
    const onResult = vi.fn();
    const onDismiss = vi.fn();
    render(
      <MiniGameCard config={config('multipleChoice')} role="knownLanguage" onDismiss={onDismiss} onResult={onResult} />
    );
    const shouldUseAudio = shouldUseDeterministicAudioPromptForGameId('test-multipleChoice');
    const sourceLang = shouldUseAudio ? 'cz' : getDeterministicSourceLangForGameId('test-multipleChoice');
    const correctAnswer = sourceLang === 'cz' ? 'con chó' : 'pes';
    fireEvent.click(await screen.findByText(correctAnswer));
    expect(onResult).toHaveBeenCalledWith(1);
    // The shared continue button dismisses the completed game.
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('passes level to choice game scoring (+2 for level 2 correct answer)', async () => {
    const onResult = vi.fn();
    render(
      <MiniGameCard
        config={{ ...config('multipleChoice'), id: 'test-multipleChoice-l2', level: 2 }}
        role="knownLanguage"
        onDismiss={vi.fn()}
        onResult={onResult}
      />
    );
    const shouldUseAudio = shouldUseDeterministicAudioPromptForGameId('test-multipleChoice-l2');
    const sourceLang = shouldUseAudio ? 'cz' : getDeterministicSourceLangForGameId('test-multipleChoice-l2');
    const correctAnswer = sourceLang === 'cz' ? 'con chó' : 'pes';
    fireEvent.click(await screen.findByText(correctAnswer));
    expect(onResult).toHaveBeenCalledWith(2);
  });

  it('keeps multiple choice in text mode when the prompt audio file does not exist', async () => {
    expect(shouldUseDeterministicAudioPromptForGameId('audio-c')).toBe(true);

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const ok = url.includes('/speech/vi/sample.mp3');
      return new Response(null, { status: ok ? 200 : 404 });
    });

    const brokenPromptWords: NormalizedWord[] = WORDS.map((word, index) => ({
      ...word,
      czAudio: index === 0 ? '/speech/cz/missing.mp3' : word.czAudio,
      viAudio: undefined,
    }));

    render(
      <MiniGameCard
        config={{ ...config('multipleChoice'), id: 'audio-c', words: brokenPromptWords }}
        role="knownLanguage"
        onDismiss={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('🎯 Choice')).toBeInTheDocument();
    });
  });

  it('keeps the stage badge and the sound toggle side by side in one top lane', async () => {
    render(<MiniGameCard config={config('multipleChoice')} role="knownLanguage" onDismiss={vi.fn()} />);

    const badge = await screen.findByRole('img', { name: 'New' });
    const toggle = screen.getByRole('button', { name: /sound (on|off)/i });

    // Laid out in flow inside the same lane, so neither can be pinned on top of
    // the other the way two independent absolute corners were.
    expect(toggle.parentElement).toBe(badge.parentElement);
    expect(badge.parentElement?.className).toContain('flex');
    expect(toggle.className).not.toContain('absolute');
    expect(badge.className).not.toContain('absolute');
  });

  // Popping the last bubble used to advance the deck on its own, which took the
  // card away mid-burst. A cleared field now raises the same tap-to-continue bar
  // every other game ends on.
  it('ends a cleared bubble field on Continue instead of dismissing itself', async () => {
    const onDismiss = vi.fn();
    render(
      <MiniGameCard config={config('bubbleChoice')} role="knownLanguage" onDismiss={onDismiss} />
    );

    // Pop every bubble: the prompt names the word whose bubble is next.
    for (let round = 0; round < WORDS.length; round += 1) {
      const prompt = WORDS.find((word) => screen.queryByText(word.cz));
      expect(prompt).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: prompt!.vi }));
    }

    const continueButton = await screen.findByRole('button', { name: 'Continue' });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(continueButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders directly in audio mode when availability was prewarmed in cache', async () => {
    expect(shouldUseDeterministicAudioPromptForGameId('audio-c')).toBe(true);

    await checkAudioUrlAvailable('/speech/cz/sample.mp3');

    render(
      <MiniGameCard
        config={{ ...config('multipleChoice'), id: 'audio-c' }}
        role="knownLanguage"
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText('🎯 Choose')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /replay prompt audio/i })).toBeInTheDocument();
    expect(screen.queryByText('pes')).not.toBeInTheDocument();
  });
});
