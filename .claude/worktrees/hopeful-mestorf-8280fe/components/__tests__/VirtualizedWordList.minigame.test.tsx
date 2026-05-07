import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualizedWordList } from '../VirtualizedWordList';
import type { NormalizedWord } from '@/lib/words';
import type { MiniGameConfig } from '@/lib/minigames';

// Virtualizer needs a scroll container with height; jsdom has none by default
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });
});

const makeWord = (id: string): NormalizedWord => ({
  id, cz: `cz-${id}`, vi: `vi-${id}`, en: '', category: ['word'],
});

const makeGame = (id: string): MiniGameConfig => ({
  _isMinigame: true,
  id,
  gameType: 'multipleChoice',
  words: [makeWord('a'), makeWord('b'), makeWord('c'), makeWord('d')],
});

describe('VirtualizedWordList with minigame items', () => {
  it('renders a minigame item when renderMiniGame is provided', () => {
    const groupedWords = [[makeWord('w1'), makeGame('g1'), makeWord('w2')]];
    render(
      <VirtualizedWordList
        groupedWords={groupedWords}
        renderCard={w => <div key={w.id}>card-{w.id}</div>}
        renderMiniGame={cfg => <div key={cfg.id}>game-{cfg.id}</div>}
        showHeaders={false}
      />
    );
    expect(screen.getByText('game-g1')).toBeInTheDocument();
  });

  it('renders word cards alongside minigame items', () => {
    const groupedWords = [[makeWord('w1'), makeGame('g1'), makeWord('w2')]];
    render(
      <VirtualizedWordList
        groupedWords={groupedWords}
        renderCard={w => <div key={w.id}>card-{w.id}</div>}
        renderMiniGame={cfg => <div key={cfg.id}>game-{cfg.id}</div>}
        showHeaders={false}
      />
    );
    expect(screen.getByText('card-w1')).toBeInTheDocument();
    expect(screen.getByText('card-w2')).toBeInTheDocument();
  });

  it('still renders correctly when no renderMiniGame provided (ignores game items)', () => {
    const groupedWords = [[makeWord('w1'), makeGame('g1')]];
    render(
      <VirtualizedWordList
        groupedWords={groupedWords}
        renderCard={w => <div key={w.id}>card-{w.id}</div>}
        showHeaders={false}
      />
    );
    expect(screen.getByText('card-w1')).toBeInTheDocument();
    expect(screen.queryByText('game-g1')).not.toBeInTheDocument();
  });
});
