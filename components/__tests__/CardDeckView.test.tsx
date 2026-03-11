import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardDeckView } from '../CardDeckView';
import type { NormalizedWord } from '@/lib/words';
import type { MiniGameConfig } from '@/lib/minigames';

const makeWord = (id: string): NormalizedWord => ({
  id, cz: `cz-${id}`, vi: `vi-${id}`, en: '', category: [],
});

const makeGame = (id: string): MiniGameConfig => ({
  _isMinigame: true,
  id,
  gameType: 'multipleChoice',
  words: [makeWord('a'), makeWord('b'), makeWord('c'), makeWord('d')],
});

describe('CardDeckView', () => {
  it('renders the first item from the flattened stream', () => {
    const groupedWords = [[makeWord('w1'), makeWord('w2')]];
    const renderCard = (word: NormalizedWord, _: number, onComplete: (afterExit?: () => void) => void) => (
      <div>
        <span data-testid={`card-${word.id}`}>{word.id}</span>
        <button onClick={onComplete}>Complete</button>
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
        <button onClick={onComplete}>Complete</button>
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
        <button onClick={onComplete}>Complete</button>
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
});
