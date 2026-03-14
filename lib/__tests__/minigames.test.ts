import { describe, it, expect } from 'vitest';
import { matchAnswer, injectMinigames, computeGameAnchors, composeStream, enforceMinigameMinGap } from '../minigames';
import type { NormalizedWord, } from '../words';
import type { MiniGameConfig } from '../minigames';

const makeWord = (id: string, cz: string, vi: string): NormalizedWord => ({
  id, cz, vi, en: '', category: ['word'],
});

describe('matchAnswer', () => {
  it('returns exact for identical strings', () => {
    expect(matchAnswer('pes', 'pes')).toBe('exact');
  });
  it('is case-insensitive for exact', () => {
    expect(matchAnswer('Pes', 'pes')).toBe('exact');
  });
  it('returns close when only diacritics differ', () => {
    expect(matchAnswer('a', 'â')).toBe('close');
    expect(matchAnswer('con meo', 'con mèo')).toBe('close');
    expect(matchAnswer('pes', 'pěs')).toBe('close');
  });
  it('returns wrong for different base letters', () => {
    expect(matchAnswer('cat', 'pes')).toBe('wrong');
  });
  it('trims whitespace', () => {
    expect(matchAnswer('  pes  ', 'pes')).toBe('exact');
  });
});

describe('injectMinigames', () => {
  const words = Array.from({ length: 20 }, (_, i) =>
    makeWord(`w${i}`, `cz${i}`, `vi${i}`)
  );

  it('injects games using stream-above when pool is empty (new user)', () => {
    const result = injectMinigames(words, [], 'cz', 42, { minInterval: 5, maxInterval: 5 });
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    expect(games.length).toBeGreaterThan(0);
    games.forEach(game => {
      expect(game.words.length).toBe(4);
      // Words should come from the stream above this anchor
      const anchorIdx = game.anchorOriginalIndex ?? 0;
      const prefixIds = new Set(words.slice(0, anchorIdx + 1).map(w => w.id));
      game.words.forEach(w => expect(prefixIds.has(w.id)).toBe(true));
    });
  });

  it('injects games using stream-above when pool has fewer than 4', () => {
    const result = injectMinigames(words, words.slice(0, 3), 'cz', 42, { minInterval: 5, maxInterval: 5 });
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    expect(games.length).toBeGreaterThan(0);
    games.forEach(game => expect(game.words.length).toBe(4));
  });

  it('injects at least one game for new user with short list (early anchors get full-list fallback)', () => {
    const shortList = Array.from({ length: 6 }, (_, i) => makeWord(`w${i}`, `cz${i}`, `vi${i}`));
    const result = injectMinigames(shortList, [], 'cz', 99, { minInterval: 1, maxInterval: 2 });
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    expect(games.length).toBeGreaterThan(0);
    games.forEach(game => expect(game.words.length).toBe(4));
  });

  it('returns empty array for empty words', () => {
    const result = injectMinigames([], words, 'cz', 42);
    expect(result).toEqual([]);
  });

  it('injects deterministic number of games for given word count and frequency', () => {
    const result = injectMinigames(words, words, 'cz', 42, { minInterval: 5, maxInterval: 5 });
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    // gap=5, 20 words → floor(20/5) = 4 games
    expect(games.length).toBe(4);
    // Running again with same params gives identical output
    const result2 = injectMinigames(words, words, 'cz', 42, { minInterval: 5, maxInterval: 5 });
    expect(result2).toEqual(result);
  });

  it('draws a new gap per insertion and stays within bounds', () => {
    const manyWords = Array.from({ length: 50 }, (_, i) => makeWord(`w${i}`, `cz${i}`, `vi${i}`));
    const result = injectMinigames(manyWords, manyWords, 'cz', 7, { minInterval: 2, maxInterval: 4 });
    const gaps: number[] = [];
    let sinceLastGame = 0;
    result.forEach(item => {
      if ('_isMinigame' in item) {
        gaps.push(sinceLastGame);
        sinceLastGame = 0;
      } else {
        sinceLastGame++;
      }
    });

    expect(gaps.length).toBeGreaterThan(2);
    expect(gaps.every(g => g >= 2 && g <= 4)).toBe(true);
    expect(new Set(gaps).size).toBeGreaterThan(1); // variation across insertions
  });

  it('never injects two consecutive minigames', () => {
    const result = injectMinigames(words, words, 'cz', 42);
    for (let i = 0; i < result.length - 1; i++) {
      if ('_isMinigame' in result[i]) {
        expect('_isMinigame' in result[i + 1]).toBe(false);
      }
    }
  });

  it('each game has exactly 4 words', () => {
    const result = injectMinigames(words, words, 'cz', 42);
    result.forEach(item => {
      if ('_isMinigame' in item) {
        expect(item.words.length).toBe(4);
      }
    });
  });

  it('game types cycle multipleChoice -> typing -> matching', () => {
    const manyWords = Array.from({ length: 50 }, (_, i) => makeWord(`w${i}`, `cz${i}`, `vi${i}`));
    const result = injectMinigames(manyWords, manyWords, 'cz', 1);
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    if (games.length >= 3) {
      expect(games[0].gameType).toBe('multipleChoice');
      expect(games[1].gameType).toBe('typing');
      expect(games[2].gameType).toBe('matching');
    }
  });

  it('anchors ID and anchorOriginalIndex to the preceding word position and seed', () => {
    const result = injectMinigames(words, words, 'cz', 9, { minInterval: 3, maxInterval: 3 });
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    expect(games.length).toBeGreaterThan(0);
    games.forEach(game => {
      const idx = result.indexOf(game);
      const wordBefore = result[idx - 1] as NormalizedWord;
      // originalIndex equals position in the original words array
      const expectedOrigIdx = words.indexOf(wordBefore);
      expect(game.anchorOriginalIndex).toBe(expectedOrigIdx);
      expect(game.id).toBe(`game-${wordBefore.id}-s9`);
    });
  });

  it('is deterministic for the same seed and varies for different seeds', () => {
    const resultA1 = injectMinigames(words, words, 'cz', 123, { minInterval: 2, maxInterval: 5 });
    const resultA2 = injectMinigames(words, words, 'cz', 123, { minInterval: 2, maxInterval: 5 });
    expect(resultA1).toEqual(resultA2);

    const resultB = injectMinigames(words, words, 'cz', 321, { minInterval: 2, maxInterval: 5 });
    expect(resultB).not.toEqual(resultA1);
  });
});

describe('composeStream', () => {
  // 5-word original list: w0…w4
  const originalWords = Array.from({ length: 5 }, (_, i) =>
    makeWord(`w${i}`, `cz${i}`, `vi${i}`)
  );
  const originalIndexMap = new Map(originalWords.map((w, i) => [w.id, i]));

  // One anchor after originalIndex 2 (after the 3rd word)
  const anchors = computeGameAnchors(originalWords, originalWords, 99, {
    minInterval: 3,
    maxInterval: 3,
  });

  it('produces the same stream as injectMinigames when no words are removed', () => {
    const composed = composeStream(originalWords, originalIndexMap, anchors);
    const injected = injectMinigames(originalWords, originalWords, 'cz', 99, {
      minInterval: 3,
      maxInterval: 3,
    });
    expect(composed).toEqual(injected);
  });

  it('game stays in stream when the word before it is removed', () => {
    // Remove w2 (the word the game follows at originalIndex 2)
    const currentWords = originalWords.filter(w => w.id !== 'w2');
    const stream = composeStream(currentWords, originalIndexMap, anchors);
    const gameCount = stream.filter(item => '_isMinigame' in item).length;
    expect(gameCount).toBe(anchors.length);
  });

  it('game inserts after the nearest lower surviving word when its anchor word is removed', () => {
    // Remove w2; game should now follow w1 (originalIndex 1, the next lower surviving word)
    const currentWords = originalWords.filter(w => w.id !== 'w2');
    const stream = composeStream(currentWords, originalIndexMap, anchors);
    const gameIdx = stream.findIndex(item => '_isMinigame' in item);
    const itemBefore = gameIdx > 0 ? stream[gameIdx - 1] : null;
    // w1 is the last remaining word with origIdx < 2
    expect(itemBefore && !('_isMinigame' in itemBefore) && (itemBefore as NormalizedWord).id).toBe('w1');
  });

  it('game floats to top when all words with origIdx <= anchor are removed', () => {
    // Remove w0, w1, w2 — no surviving word has origIdx ≤ 2
    const currentWords = originalWords.filter(w => !['w0', 'w1', 'w2'].includes(w.id));
    const stream = composeStream(currentWords, originalIndexMap, anchors);
    // Game should be at index 0
    expect('_isMinigame' in stream[0]).toBe(true);
  });

  it('game count never decreases when words are removed', () => {
    const fullStream = composeStream(originalWords, originalIndexMap, anchors);
    const fullGameCount = fullStream.filter(item => '_isMinigame' in item).length;

    // Remove words one by one and verify game count stays the same
    for (const wordToRemove of originalWords) {
      const subset = originalWords.filter(w => w.id !== wordToRemove.id);
      const stream = composeStream(subset, originalIndexMap, anchors);
      const gameCount = stream.filter(item => '_isMinigame' in item).length;
      expect(gameCount).toBe(fullGameCount);
    }
  });
});

describe('enforceMinigameMinGap', () => {
  it('never allows back-to-back games and drops trailing games without room', () => {
    const w = makeWord('w', 'cz', 'vi');
    const g1: MiniGameConfig = { _isMinigame: true, id: 'g1', gameType: 'typing', words: [w, w, w, w], anchorOriginalIndex: 0 };
    const g2: MiniGameConfig = { _isMinigame: true, id: 'g2', gameType: 'typing', words: [w, w, w, w], anchorOriginalIndex: 0 };
    const g3: MiniGameConfig = { _isMinigame: true, id: 'g3', gameType: 'typing', words: [w, w, w, w], anchorOriginalIndex: 0 };
    const stream = [g1, g2, w, g3];
    const out = enforceMinigameMinGap(stream, 1);
    expect(out.map(i => ('_isMinigame' in i ? i.id : i.id))).toEqual(['g1', 'w', 'g2']);
  });
});
