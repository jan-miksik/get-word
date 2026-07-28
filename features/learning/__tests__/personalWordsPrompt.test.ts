import { describe, expect, it } from 'vitest';
import type { ProgressData } from '@/features/sync/types';
import type { NormalizedWord } from '@/lib/words';
import { shouldOfferMorePersonalWords } from '../personalWordsPrompt';

const word = (id: string, listId = 'personal'): NormalizedWord => ({
  id,
  listId,
  category: [],
  cz: id,
  en: '',
  vi: id,
});

describe('shouldOfferMorePersonalWords', () => {
  const personalListIds = new Set(['personal']);

  it('waits while a personal item is new or due', () => {
    const words = [word('new'), word('due')];
    const progress: Record<string, ProgressData> = {
      due: {
        stageIndex: 2,
        knownCount: 1,
        unknownCount: 0,
        nextDueAt: Date.now() - 1,
      },
    };

    expect(
      shouldOfferMorePersonalWords({ words, progress, personalListIds }),
    ).toBe(false);
  });

  it('offers another batch once every personal item is settling', () => {
    const progress: Record<string, ProgressData> = {
      first: {
        stageIndex: 1,
        knownCount: 1,
        unknownCount: 0,
        nextDueAt: Date.now() + 60_000,
      },
      second: {
        stageIndex: 3,
        knownCount: 2,
        unknownCount: 0,
        nextDueAt: Date.now() + 60_000,
      },
    };

    expect(
      shouldOfferMorePersonalWords({
        words: [word('first'), word('second'), word('other', 'shared')],
        progress,
        personalListIds,
      }),
    ).toBe(true);
  });

  it('does not offer anything before a personal list has items', () => {
    expect(
      shouldOfferMorePersonalWords({
        words: [word('shared', 'shared')],
        progress: {},
        personalListIds,
      }),
    ).toBe(false);
  });
});
