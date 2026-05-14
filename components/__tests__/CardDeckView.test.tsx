import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardDeckView } from '../CardDeckView';
import type { NormalizedWord } from '@/lib/words';
import type { MiniGameConfig } from '@/lib/minigames';

const {
  checkAudioUrlAvailableMock,
  prefetchAudioMock,
} = vi.hoisted(() => ({
  checkAudioUrlAvailableMock: vi.fn(() => Promise.resolve(true)),
  prefetchAudioMock: vi.fn(),
}));

vi.mock('@/lib/audio-availability', () => ({
  checkAudioUrlAvailable: checkAudioUrlAvailableMock,
}));

vi.mock('@/lib/audio-prefetch', () => ({
  prefetchAudio: prefetchAudioMock,
}));

const makeWord = (id: string): NormalizedWord => ({
  id,
  cz: `cz-${id}`,
  vi: `vi-${id}`,
  en: '',
  category: [],
  czAudio: 'speech/cz/sample.mp3',
  viAudio: 'speech/vi/sample.mp3',
});

const makeGame = (id: string): MiniGameConfig => ({
  _isMinigame: true,
  id,
  gameType: 'multipleChoice',
  words: [makeWord('a'), makeWord('b'), makeWord('c'), makeWord('d')],
});

describe('CardDeckView', () => {
  beforeEach(() => {
    checkAudioUrlAvailableMock.mockClear();
    prefetchAudioMock.mockClear();
  });

  it('warms audio availability and prefetches for the current and next 2 items', async () => {
    const groupedWords = [[
      makeWord('w1'),
      makeGame('g1'),
      makeWord('w2'),
      makeWord('w3'),
    ]];

    render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={(word) => <span data-testid={`card-${word.id}`}>{word.id}</span>}
        renderMiniGame={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(prefetchAudioMock).toHaveBeenCalledWith([
        '/speech/cz/sample.mp3',
        '/speech/vi/sample.mp3',
      ]);
    });
    expect(checkAudioUrlAvailableMock).toHaveBeenCalledTimes(2);
    expect(checkAudioUrlAvailableMock).toHaveBeenNthCalledWith(1, '/speech/cz/sample.mp3');
    expect(checkAudioUrlAvailableMock).toHaveBeenNthCalledWith(2, '/speech/vi/sample.mp3');
  });

  it('renders the first item from the flattened stream', () => {
    const groupedWords = [[makeWord('w1'), makeWord('w2')]];
    const renderCard = (word: NormalizedWord, _: number, onComplete: (afterExit?: () => void) => void) => (
      <div>
        <span data-testid={`card-${word.id}`}>{word.id}</span>
        <button onClick={() => onComplete()}>Complete</button>
      </div>
    );
    render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );
    expect(screen.getByTestId('card-w1')).toBeInTheDocument();
    expect(screen.queryByTestId('card-w2')).not.toBeInTheDocument();
  });

  it('advances to next item after onComplete is called', async () => {
    const groupedWords = [[makeWord('w1'), makeWord('w2')]];
    const renderCard = (word: NormalizedWord, _: number, onComplete: (afterExit?: () => void) => void) => (
      <div>
        <span data-testid={`card-${word.id}`}>{word.id}</span>
        <button onClick={() => onComplete()}>Complete</button>
      </div>
    );
    render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText('Complete'));
    expect(screen.getByTestId('card-w2')).toBeInTheDocument();
  });

  it('renders a minigame when the current item is a MiniGameConfig', () => {
    const groupedWords = [[makeGame('g1')]];
    const renderMiniGame = (config: MiniGameConfig, onComplete: () => void) => (
      <div data-testid={`game-${config.id}`}>
        <button onClick={onComplete}>Finish game</button>
      </div>
    );
    render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={vi.fn()}
        renderMiniGame={renderMiniGame}
      />
    );
    expect(screen.getByTestId('game-g1')).toBeInTheDocument();
  });

  it('flattens multi-group stream in order', () => {
    const groupedWords = [[makeWord('w1')], [makeWord('w2')], [makeWord('w3')]];
    const renderCard = (word: NormalizedWord) => (
      <span data-testid={`card-${word.id}`}>{word.id}</span>
    );
    render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );
    expect(screen.getByTestId('card-w1')).toBeInTheDocument();
  });

  it('shows all-done state when past the last card', async () => {
    const groupedWords = [[makeWord('w1')]];
    const renderCard = (word: NormalizedWord, _: number, onComplete: (afterExit?: () => void) => void) => (
      <div>
        <span>{word.id}</span>
        <button onClick={() => onComplete()}>Complete</button>
      </div>
    );
    render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText('Complete'));
    expect(screen.getByText(/all done/i)).toBeInTheDocument();
  });

  it('resets the deck cursor when switching to a different grouped word set', async () => {
    const renderCard = (word: NormalizedWord, _: number, onComplete: (afterExit?: () => void) => void) => (
      <div>
        <span data-testid={`card-${word.id}`}>{word.id}</span>
        <button onClick={() => onComplete()}>Complete</button>
      </div>
    );

    const { rerender } = render(
      <CardDeckView
        groupedWords={[[makeWord('w1')]]}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );

    await userEvent.click(screen.getByText('Complete'));
    expect(screen.getByText(/all done/i)).toBeInTheDocument();

    rerender(
      <CardDeckView
        groupedWords={[[makeWord('w2')]]}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );

    expect(screen.getByTestId('card-w2')).toBeInTheDocument();
    expect(screen.queryByText(/all done/i)).not.toBeInTheDocument();
  });
});
