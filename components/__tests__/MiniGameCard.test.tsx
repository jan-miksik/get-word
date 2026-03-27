import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MiniGameCard, getDeterministicSourceLangForGameId } from '../MiniGameCard';
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
    expect(screen.getByText('🎯 Choice')).toBeInTheDocument();
  });

  it('renders TypingChallengeGame for typing type', () => {
    render(<MiniGameCard config={config('typing')} role="cz" onDismiss={vi.fn()} />);
    expect(screen.getByText('⌨️ Type it')).toBeInTheDocument();
  });

  it('renders MatchingPairsGame for matching type', () => {
    render(<MiniGameCard config={config('matching')} role="cz" onDismiss={vi.fn()} />);
    expect(screen.getByText('🔗 Match')).toBeInTheDocument();
  });

  it('passes role to the game component', () => {
    render(<MiniGameCard config={config('multipleChoice')} role="vi" onDismiss={vi.fn()} />);
    const sourceLang = getDeterministicSourceLangForGameId('test-multipleChoice');
    const expectedOption = sourceLang === 'cz' ? 'con chó' : 'pes';
    expect(screen.getByText(expectedOption)).toBeInTheDocument();
  });

  it('passes onResult to the game component and calls it on answer', () => {
    const onResult = vi.fn();
    const onDismiss = vi.fn();
    render(
      <MiniGameCard config={config('multipleChoice')} role="cz" onDismiss={onDismiss} onResult={onResult} />
    );
    const sourceLang = getDeterministicSourceLangForGameId('test-multipleChoice');
    const correctAnswer = sourceLang === 'cz' ? 'con chó' : 'pes';
    fireEvent.click(screen.getByText(correctAnswer));
    expect(onResult).toHaveBeenCalledWith(1);
    // Overlay appears, clicking it dismisses the card
    fireEvent.click(screen.getByText('Tap to continue'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
