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
import type { MiniGameConfig } from '@/lib/minigames';
import type { NormalizedWord } from '@/lib/words';

const makeWord = (id: string, cz: string, vi: string): NormalizedWord => ({
  id,
  cz,
  vi,
  en: '',
  category: ['word'],
  czAudio: 'speech/cz/sample.mp3',
  viAudio: 'speech/vi/sample.mp3',
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
  vi.stubGlobal(
    'Audio',
    vi.fn().mockImplementation(function FakeAudio(this: { play: () => Promise<void>; pause: () => void }, _src: string) {
      this.play = () => Promise.resolve();
      this.pause = () => {};
    }),
  );
  global.fetch = vi.fn(async () => ({ ok: true, status: 200 } as Response));
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

  it('renders MatchingPairsGame for matching type', async () => {
    render(<MiniGameCard config={config('matching')} role="knownLanguage" onDismiss={vi.fn()} />);
    expect(await screen.findByText('🔗 Match')).toBeInTheDocument();
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
      viAudio: 'speech/vi/sample.mp3',
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
      viAudio: 'speech/vi/sample.mp3',
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
    // Overlay appears, clicking it dismisses the card
    fireEvent.click(screen.getByText(/tap to continue/i));
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
      return { ok, status: ok ? 200 : 404 } as Response;
    });

    const brokenPromptWords: NormalizedWord[] = WORDS.map((word, index) => ({
      ...word,
      czAudio: index === 0 ? 'speech/cz/missing.mp3' : word.czAudio,
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
