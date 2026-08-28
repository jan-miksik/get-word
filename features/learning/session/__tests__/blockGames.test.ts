import { describe, expect, it } from 'vitest';

import { recordBlockGames, summarizeBlockGames } from '../blockGames';

const game = (id: string) => ({ _isMinigame: true as const, id });
const word = (id: string) => ({ id });

describe('block game ledger', () => {
  it('keeps a round in the block once it has been offered', () => {
    const first = recordBlockGames({}, [
      { key: 'review-0', items: [word('a'), game('g1'), word('b'), game('g2')] },
    ]);
    // The stream re-derives rounds from the words still standing, so the same
    // block can come back holding fewer of them. The ledger must not shrink.
    const second = recordBlockGames(first, [{ key: 'review-0', items: [word('b'), game('g2')] }]);
    expect(second['review-0']).toEqual(['g1', 'g2']);
  });

  it('returns the same object when nothing new was offered', () => {
    const ledger = recordBlockGames({}, [{ key: 'review-0', items: [game('g1')] }]);
    expect(recordBlockGames(ledger, [{ key: 'review-0', items: [game('g1')] }])).toBe(ledger);
  });

  it('counts a played round as done and a vanished one as unreachable', () => {
    const ledger = recordBlockGames({}, [
      { key: 'review-0', items: [game('played'), game('skipped'), game('waiting')] },
    ]);
    // 'skipped' left the stream without being played: its slot disappears from
    // the rail rather than filling itself.
    const summary = summarizeBlockGames(
      ledger,
      [{ key: 'review-0', items: [game('waiting')] }],
      new Set(['played']),
    );
    expect(summary['review-0']).toEqual({ total: 3, done: 1, unavailable: 1 });
  });

  it('reports nothing for a block that never held a round', () => {
    expect(summarizeBlockGames({}, [{ key: 'new-0', items: [word('a')] }], new Set())).toEqual({});
  });
});
