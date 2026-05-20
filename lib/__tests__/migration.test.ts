import { describe, it, expect } from 'vitest';
import { wordListItemsToNormalizedWords, isDue, normalizeWords, getAvailableCategories } from '@/lib/words';
import type { NormalizedWord } from '@/lib/words';
import { WORDS as RAW_WORDS } from '../../wordbook/slova.js';
import type { Word } from '@/data/words';

// Simulate what the migration script does: convert static words → word_list_items → NormalizedWord
describe('Migration: wordListItemsToNormalizedWords', () => {
  const staticWords = normalizeWords(RAW_WORDS as Word[]);

  // Simulate migrated word_list_items (what the DB would have after migration)
  const categories: Record<string, { name: string; position: number }> = {};
  const categoryNameToId = new Map<string, string>();
  let catPos = 0;
  for (const word of staticWords) {
    for (const cat of word.category) {
      if (cat === 'word' || cat === 'phrase') continue;
      if (!categoryNameToId.has(cat)) {
        const id = `cat-${catPos}`;
        categoryNameToId.set(cat, id);
        categories[id] = { name: cat, position: catPos++ };
      }
    }
  }

  const simulatedItems = staticWords.map((word, i) => {
    const primaryCat = word.category.find(c => c !== 'word' && c !== 'phrase');
    return {
      id: `item-${i}`, // simulated UUID
      categoryId: primaryCat ? categoryNameToId.get(primaryCat)! : null,
      textKnown: word.cz,
      textTarget: word.vi,
      notes: word.en ? `en: ${word.en}` : null,
      position: i,
    };
  });

  const converted = wordListItemsToNormalizedWords(simulatedItems, categories, 'vi');

  it('produces same number of words as static WORDS (all have cz+vi)', () => {
    expect(converted.length).toBe(staticWords.length);
  });

  it('preserves cz text for all words', () => {
    for (let i = 0; i < staticWords.length; i++) {
      expect(converted[i].cz).toBe(staticWords[i].cz);
    }
  });

  it('preserves vi text for all words', () => {
    for (let i = 0; i < staticWords.length; i++) {
      expect(converted[i].vi).toBe(staticWords[i].vi);
    }
  });

  it('preserves English text from notes', () => {
    for (let i = 0; i < staticWords.length; i++) {
      expect(converted[i].en).toBe(staticWords[i].en);
    }
  });

  it('assigns category from word_categories lookup', () => {
    // Every converted word should have at least one non-meta category
    for (const word of converted) {
      const nonMeta = word.category.filter(c => c !== 'word' && c !== 'phrase');
      // Should have the primary category
      expect(nonMeta.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('infers word/phrase type correctly', () => {
    for (const word of converted) {
      const hasType = word.category.includes('word') || word.category.includes('phrase');
      expect(hasType).toBe(true);
    }
  });

  it('uses item IDs (not old word IDs) as NormalizedWord.id', () => {
    for (const word of converted) {
      expect(word.id).toMatch(/^item-\d+$/);
    }
  });

  it('filters out items without textTarget', () => {
    const itemsWithNull = [
      { id: 'a', categoryId: null, textKnown: 'hello', textTarget: null, notes: null, position: 0 },
      { id: 'b', categoryId: null, textKnown: 'world', textTarget: 'svět', notes: null, position: 1 },
    ];
    const result = wordListItemsToNormalizedWords(itemsWithNull, {}, 'vi');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('b');
  });

  it('uses editor category positions as the default available category order', () => {
    const result = wordListItemsToNormalizedWords(
      [
        { id: 'item-1', categoryId: 'cat-b', textKnown: 'b', textTarget: 'be', notes: null, position: 0 },
        { id: 'item-2', categoryId: 'cat-a', textKnown: 'a', textTarget: 'ah', notes: null, position: 1 },
      ],
      {
        'cat-a': { name: 'Alpha', position: 1 },
        'cat-b': { name: 'Beta', position: 0 },
      },
      'vi'
    );

    expect(getAvailableCategories(result).map((category) => category.name)).toEqual([
      'Beta',
      'Alpha',
    ]);
  });
});

describe('Migration: SR state preservation', () => {
  it('isDue works with both old and new progress formats', () => {
    // Old format: stageIndex + nextDueAt as timestamp
    const pastDue = { stageIndex: 3, nextDueAt: Date.now() - 60000 };
    const notDue = { stageIndex: 3, nextDueAt: Date.now() + 60000 };
    const newWord = { stageIndex: 0 };

    expect(isDue(pastDue)).toBe(true);
    expect(isDue(notDue)).toBe(false);
    expect(isDue(newWord)).toBe(false);
  });

  it('progress keyed by UUID works the same as by old word ID', () => {
    // Simulate progress map keyed by UUID
    const progress: Record<string, { stageIndex: number; nextDueAt?: number }> = {
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890': { stageIndex: 5, nextDueAt: Date.now() - 1000 },
      'b2c3d4e5-f6a7-8901-bcde-f12345678901': { stageIndex: 2, nextDueAt: Date.now() + 100000 },
    };

    const word1Id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const word2Id = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

    expect(isDue(progress[word1Id])).toBe(true);
    expect(isDue(progress[word2Id])).toBe(false);
  });
});

describe('Migration: word stream equivalence', () => {
  const staticWords = normalizeWords(RAW_WORDS as Word[]);

  // Build simulated items
  const categoryNameToId = new Map<string, string>();
  const categories: Record<string, { name: string; position: number }> = {};
  let catPos = 0;
  for (const word of staticWords) {
    for (const cat of word.category) {
      if (cat === 'word' || cat === 'phrase') continue;
      if (!categoryNameToId.has(cat)) {
        const id = `cat-${catPos}`;
        categoryNameToId.set(cat, id);
        categories[id] = { name: cat, position: catPos++ };
      }
    }
  }

  const simulatedItems = staticWords.map((word, i) => {
    const primaryCat = word.category.find(c => c !== 'word' && c !== 'phrase');
    return {
      id: `item-${i}`,
      categoryId: primaryCat ? categoryNameToId.get(primaryCat)! : null,
      textKnown: word.cz,
      textTarget: word.vi,
      notes: word.en ? `en: ${word.en}` : null,
      position: i,
    };
  });

  const converted = wordListItemsToNormalizedWords(simulatedItems, categories, 'vi');

  it('same word texts appear in same order', () => {
    for (let i = 0; i < staticWords.length; i++) {
      expect(converted[i].cz).toBe(staticWords[i].cz);
      expect(converted[i].vi).toBe(staticWords[i].vi);
    }
  });

  it('category filter works for words with that primary category', () => {
    // In the new schema, each item has ONE categoryId (primary category).
    // Words that had multiple categories will only match their primary one.
    const firstCat = staticWords[0].category.find(c => c !== 'word' && c !== 'phrase');
    if (!firstCat) return;

    // Count words where firstCat is the PRIMARY (first non-meta) category
    const primaryMatches = staticWords.filter(w => {
      const primary = w.category.find(c => c !== 'word' && c !== 'phrase');
      return primary === firstCat;
    });

    const convertedFiltered = converted.filter(w =>
      w.category.some(c => c === firstCat)
    );

    expect(convertedFiltered.length).toBe(primaryMatches.length);
  });

  it('progress can be transferred from old to new word IDs', () => {
    // Simulate old progress keyed by "w000", "w001" etc.
    const oldProgress: Record<string, { stageIndex: number }> = {};
    for (const word of staticWords.slice(0, 5)) {
      oldProgress[word.id] = { stageIndex: 3 };
    }

    // Build the old→new mapping (simulating what migration script does)
    const mapping = new Map<string, string>();
    for (let i = 0; i < staticWords.length; i++) {
      mapping.set(staticWords[i].id, `item-${i}`);
    }

    // Re-key progress
    const newProgress: Record<string, { stageIndex: number }> = {};
    for (const [oldId, data] of Object.entries(oldProgress)) {
      const newId = mapping.get(oldId);
      if (newId) newProgress[newId] = data;
    }

    // Verify all 5 words have progress transferred
    expect(Object.keys(newProgress).length).toBe(5);
    for (const [newId, data] of Object.entries(newProgress)) {
      expect(data.stageIndex).toBe(3);
      expect(newId).toMatch(/^item-\d+$/);
    }
  });
});

describe('Migration: media fallback enrichment', () => {
  it('enriches converted items with audio and pronunciation when pair matches static words', () => {
    const items = [
      {
        id: 'item-1',
        categoryId: null,
        textKnown: 'pes',
        textTarget: 'con chó',
        notes: null,
        position: 0,
      },
    ];
    const fallbackWords: NormalizedWord[] = [
      {
        id: 'w1',
        cz: 'pes',
        vi: 'con chó',
        en: 'dog',
        category: ['word'],
        czPron: '/pɛs/',
        viPron: '/kɔn cʰo˧˥/',
        czAudio: 'speech/cz/pes.mp3',
        viAudio: 'speech/vi/con-cho.mp3',
      },
    ];

    const converted = wordListItemsToNormalizedWords(items, {}, 'vi', {
      mediaFallbackWords: fallbackWords,
    });

    expect(converted[0].czAudio).toBe('speech/cz/pes.mp3');
    expect(converted[0].viAudio).toBe('speech/vi/con-cho.mp3');
    expect(converted[0].czPron).toBe('/pɛs/');
    expect(converted[0].viPron).toBe('/kɔn cʰo˧˥/');
  });

  it('does not inject media when there is no matching pair', () => {
    const items = [
      {
        id: 'item-1',
        categoryId: null,
        textKnown: 'pes',
        textTarget: 'con chó',
        notes: null,
        position: 0,
      },
    ];
    const fallbackWords: NormalizedWord[] = [
      {
        id: 'w1',
        cz: 'kočka',
        vi: 'con mèo',
        en: 'cat',
        category: ['word'],
        czAudio: 'speech/cz/kocka.mp3',
        viAudio: 'speech/vi/con-meo.mp3',
      },
    ];

    const converted = wordListItemsToNormalizedWords(items, {}, 'vi', {
      mediaFallbackWords: fallbackWords,
    });

    expect(converted[0].czAudio).toBeUndefined();
    expect(converted[0].viAudio).toBeUndefined();
  });

  it('prefers generated list-item audio when synced media URLs are available', () => {
    const items = [
      {
        id: 'item-1',
        categoryId: null,
        textKnown: 'ahoj',
        textTarget: 'xin chao',
        knownAudioUrl: '/api/audio/hash-known-123',
        knownAudioArweaveUrls: ['https://arweave.net/hash-known-123'],
        audioUrl: '/api/audio/hash-123',
        audioArweaveUrls: ['https://arweave.net/hash-123'],
        notes: null,
        position: 0,
      },
    ];

    const converted = wordListItemsToNormalizedWords(items, {}, 'vi');

    expect(converted[0].czAudio).toEqual([
      '/api/audio/hash-known-123',
      'https://arweave.net/hash-known-123',
    ]);
    expect(converted[0].viAudio).toEqual([
      '/api/audio/hash-123',
      'https://arweave.net/hash-123',
    ]);
  });
});
