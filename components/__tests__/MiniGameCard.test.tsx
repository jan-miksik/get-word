import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MiniGameCard } from '../MiniGameCard';
import type { MiniGameConfig } from '@/lib/minigames';
import type { NormalizedWord } from '@/lib/words';

const makeWord = (id: string, cz: string, vi: string): NormalizedWord => ({
  id, cz, vi, en: '', category: ['word'],
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
    // When role is 'vi', prompt shows Vietnamese word
    expect(screen.getByText('con chó')).toBeInTheDocument();
  });

  it('passes onResult to the game component and calls it on dismiss', () => {
    const onResult = vi.fn();
    render(
      <MiniGameCard config={config('multipleChoice')} role="cz" onDismiss={vi.fn()} onResult={onResult} />
    );
    // role=cz: correct answer for words[0] (pes) is con chó
    fireEvent.click(screen.getByText('con chó'));
    fireEvent.click(screen.getByText(/Next/i));
    expect(onResult).toHaveBeenCalledWith(true);
  });
});
