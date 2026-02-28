import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { StickyMiniGameCard } from '../StickyMiniGameCard';
import type { MiniGameConfig } from '@/lib/minigames';
import type { NormalizedWord } from '@/lib/words';

const makeWord = (id: string): NormalizedWord => ({
  id, cz: `cz-${id}`, vi: `vi-${id}`, en: '', category: ['word'],
});

const config: MiniGameConfig = {
  _isMinigame: true,
  id: 'game-w1',
  anchorWordId: 'w1',
  gameType: 'multipleChoice',
  words: [makeWord('a'), makeWord('b'), makeWord('c'), makeWord('d')],
};

describe('StickyMiniGameCard', () => {
  it('calls onFirstSeen with the config on mount', () => {
    const onFirstSeen = vi.fn();
    render(
      <StickyMiniGameCard
        config={config}
        role="cz"
        onDismiss={vi.fn()}
        onFirstSeen={onFirstSeen}
      />
    );
    expect(onFirstSeen).toHaveBeenCalledWith(config);
    expect(onFirstSeen).toHaveBeenCalledTimes(1);
  });

  it('does not call onFirstSeen again when the component re-renders with the same id', () => {
    const onFirstSeen = vi.fn();
    const { rerender } = render(
      <StickyMiniGameCard
        config={config}
        role="cz"
        onDismiss={vi.fn()}
        onFirstSeen={onFirstSeen}
      />
    );
    rerender(
      <StickyMiniGameCard
        config={config}
        role="cz"
        onDismiss={vi.fn()}
        onFirstSeen={onFirstSeen}
      />
    );
    expect(onFirstSeen).toHaveBeenCalledTimes(1);
  });
});
