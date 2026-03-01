import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MatchingPairsGame } from '../MatchingPairsGame';
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

describe('MatchingPairsGame', () => {
  it('renders 4 left buttons (cz) and 4 right buttons (vi) when role is cz', () => {
    render(<MatchingPairsGame words={WORDS} role="cz" />);
    expect(screen.getByText('pes')).toBeInTheDocument();
    expect(screen.getByText('kočka')).toBeInTheDocument();
    expect(screen.getByText('con chó')).toBeInTheDocument();
    expect(screen.getByText('con mèo')).toBeInTheDocument();
  });

  it('renders vi on left and cz on right when role is vi', () => {
    render(<MatchingPairsGame words={WORDS} role="vi" />);
    expect(screen.getByText('con chó')).toBeInTheDocument();
    expect(screen.getByText('pes')).toBeInTheDocument();
  });

  it('matching a correct pair marks both buttons with matched class', () => {
    render(<MatchingPairsGame words={WORDS} role="cz" />);
    fireEvent.click(screen.getByText('pes'));
    fireEvent.click(screen.getByText('con chó'));
    expect(screen.getByText('pes').closest('button')).toHaveClass('game-match-btn--matched');
    expect(screen.getByText('con chó').closest('button')).toHaveClass('game-match-btn--matched');
  });

  it('selecting a wrong pair flashes wrong class then resets after timeout', async () => {
    vi.useFakeTimers();
    render(<MatchingPairsGame words={WORDS} role="cz" />);
    fireEvent.click(screen.getByText('pes'));
    fireEvent.click(screen.getByText('con mèo')); // wrong pair
    expect(screen.getByText('pes').closest('button')).toHaveClass('game-match-btn--wrong');
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(screen.getByText('pes').closest('button')).not.toHaveClass('game-match-btn--wrong');
    vi.useRealTimers();
  });

  it('shows completion message when all pairs matched', () => {
    render(<MatchingPairsGame words={WORDS} role="cz" />);
    // Match all 4 pairs (right column is shuffled but words are accessible by text)
    fireEvent.click(screen.getByText('pes'));      fireEvent.click(screen.getByText('con chó'));
    fireEvent.click(screen.getByText('kočka'));   fireEvent.click(screen.getByText('con mèo'));
    fireEvent.click(screen.getByText('auto'));    fireEvent.click(screen.getByText('xe hơi'));
    fireEvent.click(screen.getByText('voda'));    fireEvent.click(screen.getByText('nước'));
    expect(screen.getByText(/All matched/i)).toBeInTheDocument();
  });

  it('calls onResult(true) when all pairs matched', () => {
    const onResult = vi.fn();
    render(<MatchingPairsGame words={WORDS} role="cz" onResult={onResult} />);
    fireEvent.click(screen.getByText('pes'));      fireEvent.click(screen.getByText('con chó'));
    fireEvent.click(screen.getByText('kočka'));   fireEvent.click(screen.getByText('con mèo'));
    fireEvent.click(screen.getByText('auto'));    fireEvent.click(screen.getByText('xe hơi'));
    fireEvent.click(screen.getByText('voda'));    fireEvent.click(screen.getByText('nước'));
    expect(onResult).toHaveBeenCalledWith(true);
  });
});
