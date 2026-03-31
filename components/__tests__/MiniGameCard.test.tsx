import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  MiniGameCard,
  getDeterministicSourceLangForGameId,
  shouldUseDeterministicAudioPromptForGameId,
} from '../MiniGameCard';
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
  vi.stubGlobal(
    'Audio',
    vi.fn().mockImplementation(function FakeAudio(this: { play: () => Promise<void>; pause: () => void }, _src: string) {
      this.play = () => Promise.resolve();
      this.pause = () => {};
    }),
  );
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

  it('renders MultipleChoiceGame for multipleChoice type', () => {
    render(<MiniGameCard config={config('multipleChoice')} role="cz" onDismiss={vi.fn()} />);
    const shouldUseAudio = shouldUseDeterministicAudioPromptForGameId('test-multipleChoice');
    expect(screen.getByText(shouldUseAudio ? '🎯 Choose' : '🎯 Choice')).toBeInTheDocument();
  });

  it('renders TypingChallengeGame for typing type', () => {
    render(<MiniGameCard config={config('typing')} role="cz" onDismiss={vi.fn()} />);
    const shouldUseAudio = shouldUseDeterministicAudioPromptForGameId('test-typing');
    const expectedBadge = shouldUseAudio
      ? '⌨️ Type in Vietnamese'
      : '⌨️ Type it';
    expect(screen.getByText(expectedBadge)).toBeInTheDocument();
  });

  it('renders MatchingPairsGame for matching type', () => {
    render(<MiniGameCard config={config('matching')} role="cz" onDismiss={vi.fn()} />);
    expect(screen.getByText('🔗 Match')).toBeInTheDocument();
  });

  it('passes role to the game component', () => {
    render(<MiniGameCard config={config('multipleChoice')} role="vi" onDismiss={vi.fn()} />);
    const shouldUseAudio = shouldUseDeterministicAudioPromptForGameId('test-multipleChoice');
    const sourceLang = shouldUseAudio ? 'cz' : getDeterministicSourceLangForGameId('test-multipleChoice');
    const expectedOption = sourceLang === 'cz' ? 'con chó' : 'pes';
    expect(screen.getByText(expectedOption)).toBeInTheDocument();
  });

  it('uses deterministic prompt mode for matching cards', () => {
    render(<MiniGameCard config={config('matching')} role="cz" onDismiss={vi.fn()} />);
    const shouldUseAudio = shouldUseDeterministicAudioPromptForGameId('test-matching');
    if (shouldUseAudio) {
      expect(screen.getByRole('button', { name: /play 1/i })).toBeInTheDocument();
      expect(screen.queryByText('pes')).not.toBeInTheDocument();
    } else {
      expect(screen.getByText('pes')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /play 1/i })).not.toBeInTheDocument();
    }
  });

  it('in sound mode, falls back to Vietnamese audio when Czech audio is missing', () => {
    expect(shouldUseDeterministicAudioPromptForGameId('audio-c')).toBe(true);

    const fallbackWords: NormalizedWord[] = WORDS.map((word) => ({
      ...word,
      czAudio: undefined,
      viAudio: 'speech/vi/sample.mp3',
    }));
    render(
      <MiniGameCard
        config={{ ...config('multipleChoice'), id: 'audio-c', words: fallbackWords }}
        role="cz"
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText('🎯 Choose')).toBeInTheDocument();
    expect(screen.getByText('pes')).toBeInTheDocument();
  });

  it('in sound mode for matching, tries Vietnamese audio when Czech audio set is incomplete', () => {
    expect(shouldUseDeterministicAudioPromptForGameId('audio-c')).toBe(true);

    const fallbackWords: NormalizedWord[] = WORDS.map((word) => ({
      ...word,
      czAudio: undefined,
      viAudio: 'speech/vi/sample.mp3',
    }));
    render(
      <MiniGameCard
        config={{ ...config('matching'), id: 'audio-c', words: fallbackWords }}
        role="cz"
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /play 1/i })).toBeInTheDocument();
    expect(screen.getByText('pes')).toBeInTheDocument();
    expect(screen.queryByText('con chó')).not.toBeInTheDocument();
  });

  it('passes onResult to the game component and calls it on answer', () => {
    const onResult = vi.fn();
    const onDismiss = vi.fn();
    render(
      <MiniGameCard config={config('multipleChoice')} role="cz" onDismiss={onDismiss} onResult={onResult} />
    );
    const shouldUseAudio = shouldUseDeterministicAudioPromptForGameId('test-multipleChoice');
    const sourceLang = shouldUseAudio ? 'cz' : getDeterministicSourceLangForGameId('test-multipleChoice');
    const correctAnswer = sourceLang === 'cz' ? 'con chó' : 'pes';
    fireEvent.click(screen.getByText(correctAnswer));
    expect(onResult).toHaveBeenCalledWith(1);
    // Overlay appears, clicking it dismisses the card
    fireEvent.click(screen.getByText('Tap to continue'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('passes level to choice game scoring (+2 for level 2 correct answer)', () => {
    const onResult = vi.fn();
    render(
      <MiniGameCard
        config={{ ...config('multipleChoice'), id: 'test-multipleChoice-l2', level: 2 }}
        role="cz"
        onDismiss={vi.fn()}
        onResult={onResult}
      />
    );
    const shouldUseAudio = shouldUseDeterministicAudioPromptForGameId('test-multipleChoice-l2');
    const sourceLang = shouldUseAudio ? 'cz' : getDeterministicSourceLangForGameId('test-multipleChoice-l2');
    const correctAnswer = sourceLang === 'cz' ? 'con chó' : 'pes';
    fireEvent.click(screen.getByText(correctAnswer));
    expect(onResult).toHaveBeenCalledWith(2);
  });
});
