import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MatchingPairsGame } from '../MatchingPairsGame';
import type { NormalizedWord } from '@/lib/words';

vi.mock('@/lib/audio-availability', () => ({
  getPlayableAudioUrl: (url: string | null) => Promise.resolve(url),
}));

const makeWord = (
  id: string,
  cz: string,
  vi: string,
  extras?: Partial<NormalizedWord>,
): NormalizedWord => ({
  id,
  cz,
  vi,
  en: '',
  category: ['word'],
  ...extras,
});

const WORDS = [
  makeWord('a', 'pes', 'con chó', { czAudio: 'speech/cz/pes.mp3' }),
  makeWord('b', 'kočka', 'con mèo', { czAudio: 'speech/cz/kocka.mp3' }),
  makeWord('c', 'auto', 'xe hơi', { czAudio: 'speech/cz/auto.mp3' }),
  makeWord('d', 'voda', 'nước', { czAudio: 'speech/cz/voda.mp3' }),
];

let playCalls = 0;

beforeEach(() => {
  playCalls = 0;
  vi.stubGlobal(
    'Audio',
    vi.fn().mockImplementation(function FakeAudio(this: { play: () => Promise<void>; pause: () => void }, _src: string) {
      this.play = () => {
        playCalls += 1;
        return Promise.resolve();
      };
      this.pause = () => {};
    }),
  );
});

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

  it('assigns 4 different colors to matched pairs (in match order)', () => {
    render(<MatchingPairsGame words={WORDS} role="cz" />);

    fireEvent.click(screen.getByText('pes'));
    fireEvent.click(screen.getByText('con chó'));
    expect(screen.getByText('pes').closest('button')).toHaveClass('game-match-btn--c1');
    expect(screen.getByText('con chó').closest('button')).toHaveClass('game-match-btn--c1');

    fireEvent.click(screen.getByText('kočka'));
    fireEvent.click(screen.getByText('con mèo'));
    expect(screen.getByText('kočka').closest('button')).toHaveClass('game-match-btn--c2');
    expect(screen.getByText('con mèo').closest('button')).toHaveClass('game-match-btn--c2');

    fireEvent.click(screen.getByText('auto'));
    fireEvent.click(screen.getByText('xe hơi'));
    expect(screen.getByText('auto').closest('button')).toHaveClass('game-match-btn--c3');
    expect(screen.getByText('xe hơi').closest('button')).toHaveClass('game-match-btn--c3');

    fireEvent.click(screen.getByText('voda'));
    fireEvent.click(screen.getByText('nước'));
    expect(screen.getByText('voda').closest('button')).toHaveClass('game-match-btn--c4');
    expect(screen.getByText('nước').closest('button')).toHaveClass('game-match-btn--c4');
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

  it('calls onResult(+1) when all pairs matched', () => {
    const onResult = vi.fn();
    render(<MatchingPairsGame words={WORDS} role="cz" onResult={onResult} />);
    fireEvent.click(screen.getByText('pes'));      fireEvent.click(screen.getByText('con chó'));
    fireEvent.click(screen.getByText('kočka'));   fireEvent.click(screen.getByText('con mèo'));
    fireEvent.click(screen.getByText('auto'));    fireEvent.click(screen.getByText('xe hơi'));
    fireEvent.click(screen.getByText('voda'));    fireEvent.click(screen.getByText('nước'));
    expect(onResult).toHaveBeenCalledWith(1);
  });

  it('calls onResult(+2) when level 2 is completed', () => {
    const onResult = vi.fn();
    render(<MatchingPairsGame words={WORDS} role="cz" level={2} onResult={onResult} />);
    fireEvent.click(screen.getByText('pes'));      fireEvent.click(screen.getByText('con chó'));
    fireEvent.click(screen.getByText('kočka'));   fireEvent.click(screen.getByText('con mèo'));
    fireEvent.click(screen.getByText('auto'));    fireEvent.click(screen.getByText('xe hơi'));
    fireEvent.click(screen.getByText('voda'));    fireEvent.click(screen.getByText('nước'));
    expect(onResult).toHaveBeenCalledWith(2);
  });

  it('uses listening mode with hidden source text when complete audio is available', async () => {
    render(
      <MatchingPairsGame words={WORDS} role="cz" sourceLang="cz" promptMode="audio" />
    );
    expect(screen.queryByText('pes')).not.toBeInTheDocument();
    const promptButton = screen.getByRole('button', { name: /play 1/i });
    expect(promptButton).toBeInTheDocument();
    fireEvent.click(promptButton);
    await waitFor(() => expect(playCalls).toBe(1));
  });

  it('falls back to text prompts when audio playback fails at runtime', async () => {
    vi.stubGlobal(
      'Audio',
      vi.fn().mockImplementation(function FakeAudio(this: { play: () => Promise<void>; pause: () => void }, _src: string) {
        this.play = () => Promise.reject(new Error('playback failed'));
        this.pause = () => {};
      }),
    );
    render(
      <MatchingPairsGame words={WORDS} role="cz" sourceLang="cz" promptMode="audio" />
    );
    fireEvent.click(screen.getByRole('button', { name: /play 1/i }));
    await waitFor(() => {
      expect(screen.getByText('pes')).toBeInTheDocument();
    });
  });

  it('falls back to full text mode when any source audio is missing', () => {
    const mixedAudio = [
      makeWord('a', 'pes', 'con chó', { czAudio: 'speech/cz/pes.mp3' }),
      makeWord('b', 'kočka', 'con mèo'), // missing audio triggers whole-card fallback
      makeWord('c', 'auto', 'xe hơi', { czAudio: 'speech/cz/auto.mp3' }),
      makeWord('d', 'voda', 'nước', { czAudio: 'speech/cz/voda.mp3' }),
    ];
    render(
      <MatchingPairsGame words={mixedAudio} role="cz" sourceLang="cz" promptMode="audio" />
    );
    expect(screen.getByText('pes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /play 1/i })).not.toBeInTheDocument();
  });
});
