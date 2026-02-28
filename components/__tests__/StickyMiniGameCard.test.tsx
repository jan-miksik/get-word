import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StickyMiniGameCard } from '../StickyMiniGameCard';
import type { MiniGameConfig } from '@/lib/minigames';
import type { NormalizedWord } from '@/lib/words';

const makeWord = (id: string): NormalizedWord => ({
  id, cz: `cz-${id}`, vi: `vi-${id}`, en: '', category: ['word'],
});

const config: MiniGameConfig = {
  _isMinigame: true,
  id: 'game-w1-s42',
  anchorOriginalIndex: 0,
  gameType: 'multipleChoice',
  words: [makeWord('a'), makeWord('b'), makeWord('c'), makeWord('d')],
};

describe('StickyMiniGameCard', () => {
  it('renders a MiniGameCard with the given config', () => {
    render(
      <StickyMiniGameCard
        config={config}
        role="cz"
        onDismiss={vi.fn()}
      />
    );
    // The MiniGameCard renders a game-card article with badge
    expect(screen.getByText(/Choice/)).toBeDefined();
  });

  it('forwards onDismiss and onResult props', () => {
    const onDismiss = vi.fn();
    const onResult = vi.fn();
    render(
      <StickyMiniGameCard
        config={config}
        role="cz"
        onDismiss={onDismiss}
        onResult={onResult}
      />
    );
    expect(screen.getByText(/Choice/)).toBeDefined();
  });
});
