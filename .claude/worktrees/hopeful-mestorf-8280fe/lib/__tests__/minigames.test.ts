import { describe, it, expect } from 'vitest';
import {
  matchAnswer,
  injectMinigames,
  computeGameAnchors,
  composeStream,
  enforceMinigameMinGap,
  pruneAnchorsForCurrentSize,
  hasAtLeastOneSimilarPair,
} from '../minigames';
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
  it('treats đ as d (stroke, not decomposable diacritic)', () => {
    expect(matchAnswer('d', 'đ')).toBe('close');
    expect(matchAnswer('dong', 'đồng')).toBe('close');
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

  it('uses varied game types without repeating the same type back-to-back', () => {
    const manyWords = Array.from({ length: 50 }, (_, i) => makeWord(`w${i}`, `cz${i}`, `vi${i}`));
    const result = injectMinigames(manyWords, manyWords, 'cz', 1);
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    if (games.length >= 2) {
      for (let i = 1; i < games.length; i++) {
        expect(games[i].gameType).not.toBe(games[i - 1].gameType);
      }
    }
    expect(new Set(games.map((game) => game.gameType)).size).toBeGreaterThan(1);
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

  it('uses level 2 for choice/match only when a similar pair exists in the selected words', () => {
    const similarPool = [
      makeWord('s0', 'muon-a', 'muốn'),
      makeWord('s1', 'muon-b', 'muộn'),
      makeWord('s2', 'muoi-a', 'mười'),
      makeWord('s3', 'mua', 'mùa'),
      makeWord('s4', 'ban', 'bạn'),
      makeWord('s5', 'bao', 'bão'),
      makeWord('s6', 'hoa', 'hóa'),
      makeWord('s7', 'hoc', 'học'),
      makeWord('s8', 'doi', 'đợi'),
      makeWord('s9', 'dom', 'đồm'),
      makeWord('s10', 'cat', 'cát'),
      makeWord('s11', 'cam', 'cám'),
    ];

    let level2Games: MiniGameConfig[] = [];
    for (let seed = 1; seed <= 80; seed++) {
      const result = injectMinigames(similarPool, similarPool, 'cz', seed, {
        minInterval: 1,
        maxInterval: 1,
      });
      const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
      const eligible = games.filter((g) => g.gameType === 'multipleChoice' || g.gameType === 'matching');
      level2Games = eligible.filter((g) => g.level === 2);
      if (level2Games.length > 0) break;
    }

    expect(level2Games.length).toBeGreaterThan(0);
    level2Games.forEach((game) => {
      expect(hasAtLeastOneSimilarPair(game.words)).toBe(true);
    });
  });

  it('skips level 2 when there are no similar words in the pool', () => {
    const distinctPool = [
      makeWord('d0', 'alpha', 'xehoi'),
      makeWord('d1', 'bravo', 'concho'),
      makeWord('d2', 'charlie', 'nuoctrong'),
      makeWord('d3', 'delta', 'banbe'),
      makeWord('d4', 'echo', 'hoanghon'),
      makeWord('d5', 'foxtrot', 'mattroi'),
      makeWord('d6', 'golf', 'dongho'),
      makeWord('d7', 'hotel', 'thuyenbuom'),
      makeWord('d8', 'india', 'xedap'),
      makeWord('d9', 'juliet', 'khoailang'),
      makeWord('d10', 'kilo', 'tranguyen'),
      makeWord('d11', 'lima', 'phongtam'),
    ];

    const result = injectMinigames(distinctPool, distinctPool, 'cz', 17, {
      minInterval: 1,
      maxInterval: 1,
    });
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    const eligible = games.filter((g) => g.gameType === 'multipleChoice' || g.gameType === 'matching');
    expect(eligible.some((g) => g.level === 2)).toBe(false);
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

describe('pruneAnchorsForCurrentSize', () => {
  const words10 = Array.from({ length: 10 }, (_, i) => makeWord(`w${i}`, `cz${i}`, `vi${i}`));
  // Compute a fixed set of anchors (at freq 1-2 for 10 words ~5-6 anchors)
  const anchors10 = computeGameAnchors(words10, words10, 1, { minInterval: 1, maxInterval: 2 });

  it('returns all anchors unchanged when they already fit within capacity', () => {
    // 10 words, minGap=1: maxGames = floor(10/2) = 5
    const result = pruneAnchorsForCurrentSize(anchors10, 10, 1);
    expect(result.length).toBeLessThanOrEqual(Math.floor(10 / 2));
    expect(result).toEqual(anchors10.slice(0, result.length));
  });

  it('caps anchor count to floor(wordCount / (minGap + 1))', () => {
    // 3 words, minGap=1: maxGames = floor(3/2) = 1
    const result = pruneAnchorsForCurrentSize(anchors10, 3, 1);
    expect(result.length).toBe(1);
  });

  it('preserves the earliest anchors (lowest originalIndex)', () => {
    const result = pruneAnchorsForCurrentSize(anchors10, 4, 1);
    const expected = anchors10.slice(0, Math.floor(4 / 2));
    expect(result).toEqual(expected);
  });

  it('returns all anchors when minGap is 0', () => {
    const result = pruneAnchorsForCurrentSize(anchors10, 3, 0);
    expect(result).toEqual(anchors10);
  });

  it('returns empty array when wordCount is 0', () => {
    const result = pruneAnchorsForCurrentSize(anchors10, 0, 1);
    expect(result).toEqual([]);
  });

  it('integration: composing with pruned anchors never exceeds word-to-game capacity', () => {
    // Simulate: 10 original words → anchors computed → only 3 words remain
    const words3 = words10.slice(7); // last 3 words
    const originalIndexMap = new Map(words10.map((w, i) => [w.id, i]));
    const minGap = 1;

    const pruned = pruneAnchorsForCurrentSize(anchors10, words3.length, minGap);
    const stream = composeStream(words3, originalIndexMap, pruned);

    const games = stream.filter(item => '_isMinigame' in item);
    expect(games.length).toBeLessThanOrEqual(Math.floor(words3.length / (minGap + 1)));

    // No back-to-back games
    for (let i = 0; i < stream.length - 1; i++) {
      if ('_isMinigame' in stream[i]) {
        expect('_isMinigame' in stream[i + 1]).toBe(false);
      }
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
