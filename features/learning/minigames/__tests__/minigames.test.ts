import { describe, it, expect } from 'vitest';
import {
  alternativesAreSlotCompatible,
  matchAnswer,
  getAcceptedAnswerCandidates,
  matchAnswerAgainstCandidates,
  requiresExplicitTypingCheck,
  injectMinigames as injectMinigamesRaw,
  computeGameAnchors as computeGameAnchorsRaw,
  composeStream,
  enforceMinigameMinGap,
  pruneAnchorsForCurrentSize,
  hasAtLeastOneSimilarPair,
} from '@/features/learning/minigames';
import type { NormalizedWord } from '@/lib/words';
import type { MiniGameConfig } from '@/features/learning/minigames';
import { MATCH_PAIR_COUNTS } from '@/features/learning/fine-tune/types';

import type { InjectMinigamesOptions } from '@/features/learning/minigames';

const makeWord = (id: string, cz: string, vi: string): NormalizedWord => ({
  id, cz, vi, en: '', category: ['word'],
});

// Matching is the only scheduled game now, and its variants come from the
// learner's stage — the default preset offers none at stage 0, because a round
// of words you have never seen is not review practice. These tests are about
// anchoring mechanics, so they study words that have been reviewed at least once.
const REVIEWED_STAGE = 3;
const withStage = (options?: InjectMinigamesOptions): InjectMinigamesOptions => ({
  getStageIndex: () => REVIEWED_STAGE,
  ...options,
});
const injectMinigames = (
  words: NormalizedWord[],
  learnedPool: NormalizedWord[],
  seed?: number,
  options?: InjectMinigamesOptions,
) => injectMinigamesRaw(words, learnedPool, seed, withStage(options));
const computeGameAnchors = (
  words: NormalizedWord[],
  learnedPool: NormalizedWord[],
  seed: number,
  options?: InjectMinigamesOptions,
) => computeGameAnchorsRaw(words, learnedPool, seed, withStage(options));

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

describe('matchAnswerAgainstCandidates', () => {
  it('accepts stored alternatives and reports the matched candidate', () => {
    const result = matchAnswerAgainstCandidates(
      'dobře',
      getAcceptedAnswerCandidates('dobrý', ['dobrá', 'dobré', 'dobře']),
    );
    expect(result).toEqual({
      verdict: 'exact',
      matchedAnswer: 'dobře',
      isAlternative: true,
      nearestLetterDistance: 0,
    });
  });

  it('prefers exact over earlier close alternatives', () => {
    const result = matchAnswerAgainstCandidates(
      'dobré',
      getAcceptedAnswerCandidates('dobrý', ['dobre', 'dobré']),
    );
    expect(result).toEqual({
      verdict: 'exact',
      matchedAnswer: 'dobré',
      isAlternative: true,
      nearestLetterDistance: 0,
    });
  });

  it('prefers primary answer on tied verdicts', () => {
    const result = matchAnswerAgainstCandidates(
      'dobry',
      getAcceptedAnswerCandidates('dobrý', ['dobrý-ish']),
    );
    expect(result).toEqual({
      verdict: 'close',
      matchedAnswer: 'dobrý',
      isAlternative: false,
      // "dobry" writes the same letters as "dobrý"; only the mark differs.
      nearestLetterDistance: 0,
    });
  });

  it('uses nearest wrong candidate only for presentation', () => {
    const result = matchAnswerAgainstCandidates(
      'dobra',
      getAcceptedAnswerCandidates('špatný', ['dobrá']),
    );
    expect(result).toEqual({
      verdict: 'close',
      matchedAnswer: 'dobrá',
      isAlternative: true,
      nearestLetterDistance: 0,
    });
    const wrong = matchAnswerAgainstCandidates(
      'dobrx',
      getAcceptedAnswerCandidates('špatný', ['dobrá']),
    );
    expect(wrong.verdict).toBe('wrong');
    expect(wrong.matchedAnswer).toBe('dobrá');
  });

  it('requires explicit typing only for slot-incompatible alternatives', () => {
    expect(requiresExplicitTypingCheck(getAcceptedAnswerCandidates('dobrý', []))).toBe(false);
    // Same grapheme count, no punctuation mismatch → mask + auto-check stay on.
    expect(requiresExplicitTypingCheck(getAcceptedAnswerCandidates('dobrý', ['dobrá']))).toBe(
      false,
    );
    // Different length → free input with an explicit check.
    expect(
      requiresExplicitTypingCheck(getAcceptedAnswerCandidates('dobrý', ['dobřejší'])),
    ).toBe(true);
    // One incompatible alternative flips the whole card.
    expect(
      requiresExplicitTypingCheck(getAcceptedAnswerCandidates('dobrý', ['dobrá', 'dobr'])),
    ).toBe(true);
  });

  it('checks slot compatibility against the primary answer', () => {
    expect(alternativesAreSlotCompatible('dobrý', [])).toBe(true);
    expect(alternativesAreSlotCompatible('dobrý', ['dobrá', 'dobré'])).toBe(true);
    expect(alternativesAreSlotCompatible('ice cream', ['icecreams'])).toBe(false);
    expect(alternativesAreSlotCompatible('dobrý', ['dobrá', 'dobřejší'])).toBe(false);
  });
});

describe('injectMinigames', () => {
  const words = Array.from({ length: 20 }, (_, i) =>
    makeWord(`w${i}`, `cz${i}`, `vi${i}`)
  );

  it('injects games using stream-above when pool is empty (new user)', () => {
    const result = injectMinigames(words, [], 42, { minInterval: 5, maxInterval: 5 });
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    expect(games.length).toBeGreaterThan(0);
    games.forEach(game => {
      expect(MATCH_PAIR_COUNTS).toContain(game.words.length);
      // Words should come from the stream above this anchor
      const anchorIdx = game.anchorOriginalIndex ?? 0;
      const prefixIds = new Set(words.slice(0, anchorIdx + 1).map(w => w.id));
      game.words.forEach(w => expect(prefixIds.has(w.id)).toBe(true));
    });
  });

  it('injects games using stream-above when pool has fewer than 4', () => {
    const result = injectMinigames(words, words.slice(0, 3), 42, { minInterval: 5, maxInterval: 5 });
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    expect(games.length).toBeGreaterThan(0);
    games.forEach(game => expect(MATCH_PAIR_COUNTS).toContain(game.words.length));
  });

  it('uses only stream-above words even when a larger learned pool exists', () => {
    const result = injectMinigames(words, words, 42, { minInterval: 5, maxInterval: 5 });
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    expect(games.length).toBeGreaterThan(0);
    games.forEach(game => {
      expect(MATCH_PAIR_COUNTS).toContain(game.words.length);
      const anchorIdx = game.anchorOriginalIndex ?? 0;
      const prefixIds = new Set(words.slice(0, anchorIdx + 1).map(w => w.id));
      game.words.forEach(w => expect(prefixIds.has(w.id)).toBe(true));
    });
  });

  it('supplements early games from surrounding words so the configured interval is honored', () => {
    const shortList = Array.from({ length: 6 }, (_, i) => makeWord(`w${i}`, `cz${i}`, `vi${i}`));
    const result = injectMinigames(shortList, [], 99, { minInterval: 2, maxInterval: 2 });
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    expect(games.length).toBeGreaterThan(0);
    expect(games[0].words.length).toBe(4);
    expect(games[0].anchorOriginalIndex).toBe(1);
    expect(result.slice(0, 3).map(item => '_isMinigame' in item ? item.id : item.id)).toEqual([
      'w0',
      'w1',
      games[0].id,
    ]);
  });

  it('prefers surrounding words from the same category when supplementing early games', () => {
    const makeCategorizedWord = (id: string, category: string): NormalizedWord => ({
      ...makeWord(id, `cz-${id}`, `vi-${id}`),
      category: [category, 'word'],
    });
    const mixedList = [
      makeCategorizedWord('travel-0', 'travel'),
      makeCategorizedWord('travel-1', 'travel'),
      makeCategorizedWord('food-0', 'food'),
      makeCategorizedWord('food-1', 'food'),
      makeCategorizedWord('travel-2', 'travel'),
      makeCategorizedWord('travel-3', 'travel'),
    ];

    const result = injectMinigames(mixedList, [], 99, { minInterval: 2, maxInterval: 2 });
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];

    expect(games[0].words.map(word => word.id).sort()).toEqual([
      'travel-0',
      'travel-1',
      'travel-2',
      'travel-3',
    ]);
  });

  it('returns empty array for empty words', () => {
    const result = injectMinigames([], words, 42);
    expect(result).toEqual([]);
  });

  it('injects deterministic number of games for given word count and frequency', () => {
    const result = injectMinigames(words, words, 42, { minInterval: 5, maxInterval: 5 });
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    // gap=5, 20 words → floor(20/5) = 4 games
    expect(games.length).toBe(4);
    // Running again with same params gives identical output
    const result2 = injectMinigames(words, words, 42, { minInterval: 5, maxInterval: 5 });
    expect(result2).toEqual(result);
  });

  it('draws a new gap per insertion and stays within bounds', () => {
    const manyWords = Array.from({ length: 50 }, (_, i) => makeWord(`w${i}`, `cz${i}`, `vi${i}`));
    const result = injectMinigames(manyWords, manyWords, 7, { minInterval: 2, maxInterval: 4 });
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
    const result = injectMinigames(words, words, 42);
    for (let i = 0; i < result.length - 1; i++) {
      if ('_isMinigame' in result[i]) {
        expect('_isMinigame' in result[i + 1]).toBe(false);
      }
    }
  });

  it('sizes each round to one of the configured pair counts', () => {
    const result = injectMinigames(words, words, 42);
    result.forEach(item => {
      if ('_isMinigame' in item) {
        expect(MATCH_PAIR_COUNTS).toContain(item.words.length);
      }
    });
  });

  it('varies the words between consecutive rounds', () => {
    // Multiple choice and typing are study cards now, so matching is the only
    // scheduled game and the old "never repeat the type" rule has nothing left
    // to vary. What still matters is that two rounds in a row are not identical.
    const manyWords = Array.from({ length: 50 }, (_, i) => makeWord(`w${i}`, `cz${i}`, `vi${i}`));
    const result = injectMinigames(manyWords, manyWords, 1);
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    expect(games.length).toBeGreaterThan(1);
    const signature = (game: MiniGameConfig) =>
      game.words.map((word) => word.id).sort().join('|');
    for (let i = 1; i < games.length; i++) {
      expect(signature(games[i])).not.toBe(signature(games[i - 1]));
    }
  });

  it('anchors ID and anchorOriginalIndex to the preceding word position and seed', () => {
    const result = injectMinigames(words, words, 9, { minInterval: 3, maxInterval: 3 });
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
    const resultA1 = injectMinigames(words, words, 123, { minInterval: 2, maxInterval: 5 });
    const resultA2 = injectMinigames(words, words, 123, { minInterval: 2, maxInterval: 5 });
    expect(resultA1).toEqual(resultA2);

    const resultB = injectMinigames(words, words, 321, { minInterval: 2, maxInterval: 5 });
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
      const result = injectMinigames(similarPool, similarPool, seed, {
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

  it('skips matching when the pool cannot meet the configured similarity floor', () => {
    // Both sides must be unrelated: a band is the more confusable of the two,
    // and "over half the letters shared" is enough to reach band II, so words
    // sharing a stem on either side would not make this pool distinct.
    const distinctPool = Array.from({ length: 12 }, (_, index) => {
      const term = String.fromCharCode(97 + index).repeat(8);
      return makeWord(`d${index}`, term, term);
    });
    expect(hasAtLeastOneSimilarPair(distinctPool)).toBe(false);

    const result = injectMinigames(distinctPool, distinctPool, 17, {
      minInterval: 1,
      maxInterval: 1,
    });
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    expect(games).toEqual([]);
  });
});

describe('similar-word prompts', () => {
  it('inserts an actionable prompt only when a game pool has no similar pair', () => {
    const unrelated = [
      makeWord('a', 'pes', 'con chó'),
      makeWord('b', 'auto', 'xe hơi'),
      makeWord('c', 'kniha', 'quyển sách'),
      makeWord('d', 'voda', 'nước'),
    ];
    const prompts = computeGameAnchorsRaw(unrelated, [], 5, {
      minInterval: 2,
      maxInterval: 2,
      excludeGameTypes: ['matching'],
      includeGameTypes: ['similarWordsPrompt'],
    });
    expect(prompts.some((anchor) => anchor.gameType === 'similarWordsPrompt')).toBe(true);

    const withTwins = [...unrelated.slice(0, 3), makeWord('d', 'pesa', 'nuoc')];
    const noPrompt = computeGameAnchorsRaw(withTwins, [], 5, {
      minInterval: 2,
      maxInterval: 2,
      excludeGameTypes: ['matching'],
      includeGameTypes: ['similarWordsPrompt'],
    });
    expect(noPrompt).toEqual([]);
  });
});

describe('composeStream', () => {
  // 6-word original list: w0…w5
  const originalWords = Array.from({ length: 6 }, (_, i) =>
    makeWord(`w${i}`, `cz${i}`, `vi${i}`)
  );
  const originalIndexMap = new Map(originalWords.map((w, i) => [w.id, i]));

  // One anchor after originalIndex 3 (after the 4th word)
  const anchors = computeGameAnchors(originalWords, originalWords, 99, {
    minInterval: 4,
    maxInterval: 4,
  });

  it('produces the same stream as injectMinigames when no words are removed', () => {
    const composed = composeStream(originalWords, originalIndexMap, anchors);
    const injected = injectMinigames(originalWords, originalWords, 99, {
      minInterval: 4,
      maxInterval: 4,
    });
    expect(composed).toEqual(injected);
  });

  it('game stays in stream when the word before it is removed', () => {
    // Remove w3 (the word the game follows at originalIndex 3)
    const currentWords = originalWords.filter(w => w.id !== 'w3');
    const stream = composeStream(currentWords, originalIndexMap, anchors);
    const gameCount = stream.filter(item => '_isMinigame' in item).length;
    expect(gameCount).toBe(anchors.length);
  });

  it('game inserts after the nearest lower surviving word when its anchor word is removed', () => {
    // Remove w3; game should now follow w2 (originalIndex 2, the next lower surviving word)
    const currentWords = originalWords.filter(w => w.id !== 'w3');
    const stream = composeStream(currentWords, originalIndexMap, anchors);
    const gameIdx = stream.findIndex(item => '_isMinigame' in item);
    const itemBefore = gameIdx > 0 ? stream[gameIdx - 1] : null;
    // w2 is the last remaining word with origIdx < 3
    expect(itemBefore && !('_isMinigame' in itemBefore) && (itemBefore as NormalizedWord).id).toBe('w2');
  });

  it('game floats to top when all words with origIdx <= anchor are removed', () => {
    // Remove w0, w1, w2, w3 — no surviving word has origIdx ≤ 3
    const currentWords = originalWords.filter(w => !['w0', 'w1', 'w2', 'w3'].includes(w.id));
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
  const anchors10 = computeGameAnchors(words10, words10, 1, { minInterval: 2, maxInterval: 2 });

  it('returns all anchors unchanged when they already fit within capacity', () => {
    const result = pruneAnchorsForCurrentSize(anchors10, 10, 2);
    expect(result.length).toBeLessThanOrEqual(1 + Math.floor(10 / 2));
    expect(result).toEqual(anchors10.slice(0, result.length));
  });

  it('does not drop valid late anchors from a full new-word run', () => {
    // Asserting against the generated anchors rather than a fixed list: the
    // point here is that pruning keeps everything when it all fits, not which
    // anchors the generator happened to produce.
    const result = pruneAnchorsForCurrentSize(anchors10, words10.length, 2);
    expect(result.map((anchor) => anchor.anchorOriginalIndex)).toEqual(
      anchors10.map((anchor) => anchor.anchorOriginalIndex),
    );
    expect(result.length).toBeGreaterThan(1);
  });

  it('caps anchors to available spaced slots after cards disappear', () => {
    const result = pruneAnchorsForCurrentSize(anchors10, 3, 2);
    expect(result.length).toBe(2);
  });

  it('preserves the earliest anchors (lowest originalIndex)', () => {
    const result = pruneAnchorsForCurrentSize(anchors10, 4, 2);
    const expected = anchors10.slice(0, 1 + Math.floor(4 / 2));
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
    // Simulate: 10 original words -> anchors computed -> only 3 words remain.
    // One pending game may float before the first surviving word.
    const words3 = words10.slice(7); // last 3 words
    const originalIndexMap = new Map(words10.map((w, i) => [w.id, i]));
    const minGap = 2;

    const pruned = pruneAnchorsForCurrentSize(anchors10, words3.length, minGap);
    const stream = enforceMinigameMinGap(
      composeStream(words3, originalIndexMap, pruned),
      minGap,
    );

    const games = stream.filter(item => '_isMinigame' in item);
    expect(games.length).toBeLessThanOrEqual(1 + Math.floor(words3.length / minGap));

    let wordsSinceGame = minGap;
    for (const item of stream) {
      if ('_isMinigame' in item) {
        expect(wordsSinceGame).toBeGreaterThanOrEqual(minGap);
        wordsSinceGame = 0;
      } else {
        wordsSinceGame += 1;
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

describe('computeGameAnchors excludeGameTypes', () => {
  const words = Array.from({ length: 40 }, (_, i) =>
    makeWord(`w${i}`, `cz${i}`, `vi${i}`)
  );

  it('never schedules an excluded game type (typing mode keeps the other quizzes)', () => {
    for (const seed of [1, 7, 42, 99, 12345]) {
      const anchors = computeGameAnchors(words, [], seed, {
        minInterval: 2,
        maxInterval: 3,
        excludeGameTypes: ['typing'],
      });
      expect(anchors.length).toBeGreaterThan(0);
      expect(anchors.every((anchor) => anchor.gameType !== 'typing')).toBe(true);
    }
  });

  it('returns no anchors when every game type is excluded', () => {
    const anchors = computeGameAnchors(words, [], 42, {
      minInterval: 2,
      maxInterval: 3,
      excludeGameTypes: ['typing', 'multipleChoice', 'matching'],
    });
    expect(anchors).toEqual([]);
  });

  it('schedules matching and nothing else', () => {
    const anchors = computeGameAnchors(words, [], 42, {
      minInterval: 2,
      maxInterval: 2,
    });
    expect(anchors.length).toBeGreaterThan(0);
    expect(new Set(anchors.map((anchor) => anchor.gameType))).toEqual(new Set(['matching']));
  });
});

describe('computeGameAnchors tiltChoice opt-in', () => {
  const onlyTilt = {
    includeGameTypes: ['tiltChoice'] as const,
    excludeGameTypes: ['multipleChoice', 'typing', 'matching'] as const,
  };
  const words = Array.from({ length: 12 }, (_, i) =>
    makeWord(`w${i}`, `source-${i}`, `answer-${i}`),
  );

  it('never schedules tiltChoice unless it is explicitly included', () => {
    const anchors = computeGameAnchors(words, [], 42, { minInterval: 2, maxInterval: 2 });
    expect(anchors.every((anchor) => anchor.gameType !== 'tiltChoice')).toBe(true);
  });

  it('creates deterministic two-answer games when included', () => {
    const options = { ...onlyTilt, minInterval: 2, maxInterval: 2 };
    const first = computeGameAnchors(words, [], 42, options);
    const second = computeGameAnchors(words, [], 42, options);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    first.forEach((anchor) => {
      expect(anchor.gameType).toBe('tiltChoice');
      expect(anchor.words).toHaveLength(2);
      expect(anchor.words[0].id).not.toBe(anchor.words[1].id);
    });
  });

  it('lets excludeGameTypes override an included tiltChoice', () => {
    const anchors = computeGameAnchors(words, [], 42, {
      includeGameTypes: ['tiltChoice'],
      excludeGameTypes: ['tiltChoice'],
      minInterval: 2,
      maxInterval: 2,
    });
    expect(anchors.every((anchor) => anchor.gameType !== 'tiltChoice')).toBe(true);
  });

  it('uses stage 3+ for level 2 when a valid similar partner exists', () => {
    const similarWords = [
      makeWord('a', 'cat', 'mèo'),
      makeWord('b', 'bat', 'chó'),
      makeWord('c', 'hat', 'nhà'),
      makeWord('d', 'mat', 'nước'),
    ];
    const anchors = computeGameAnchors(similarWords, [], 7, {
      ...onlyTilt,
      minInterval: 2,
      maxInterval: 2,
      getStageIndex: () => 3,
    });
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.every((anchor) => anchor.level === 2)).toBe(true);
  });

  it('uses level 1 below stage 3 and falls back to it without a similar partner', () => {
    const lowStage = computeGameAnchors(words, [], 7, {
      ...onlyTilt,
      minInterval: 2,
      maxInterval: 2,
      getStageIndex: () => 2,
    });
    const nonSimilar = [
      makeWord('a', 'alpha', 'river'),
      makeWord('b', 'bravo', 'mountain'),
      makeWord('c', 'charlie', 'window'),
      makeWord('d', 'delta', 'kitchen'),
    ];
    const highButDistinct = computeGameAnchors(nonSimilar, [], 7, {
      ...onlyTilt,
      minInterval: 2,
      maxInterval: 2,
      getStageIndex: () => 7,
    });
    expect(lowStage.every((anchor) => anchor.level === 1)).toBe(true);
    expect(highButDistinct.every((anchor) => anchor.level === 1)).toBe(true);
  });

  it('supports pools of two and three words', () => {
    for (const size of [2, 3]) {
      const shortPool = words.slice(0, size);
      const anchors = computeGameAnchors(shortPool, [], 9, {
        ...onlyTilt,
        minInterval: size,
        maxInterval: size,
      });
      expect(anchors).toHaveLength(1);
      expect(anchors[0].words).toHaveLength(2);
    }
  });

  it('only schedules words whose both sides fit the tilt layout', () => {
    const longWords = Array.from({ length: 8 }, (_, i) =>
      makeWord(`long${i}`, `tohle je dlouhá věta číslo ${i}`, `câu trả lời rất dài số ${i}`),
    );
    const longOnly = computeGameAnchors(longWords, [], 42, {
      ...onlyTilt,
      minInterval: 2,
      maxInterval: 2,
    });
    expect(longOnly).toEqual([]);

    const mixed = [makeWord('short-a', 'pes', 'chó'), makeWord('short-b', 'kočka', 'mèo'), ...longWords];
    for (const seed of [7, 42, 99]) {
      const anchors = computeGameAnchors(mixed, [], seed, {
        ...onlyTilt,
        minInterval: 2,
        maxInterval: 2,
      });
      for (const anchor of anchors) {
        for (const word of anchor.words) {
          expect(word.cz.length).toBeLessThanOrEqual(18);
          expect(word.vi.length).toBeLessThanOrEqual(18);
        }
      }
    }
  });

  it('never pairs visually identical answers even when word ids differ', () => {
    const duplicateAnswers = [
      makeWord('a', 'alpha', 'stejná odpověď'),
      makeWord('b', 'beta', 'Stejna odpoved!'),
      makeWord('c', 'gamma', 'jiná odpověď'),
      makeWord('d', 'delta', 'čtvrtá odpověď'),
    ];
    const anchors = computeGameAnchors(duplicateAnswers, [], 13, {
      ...onlyTilt,
      minInterval: 2,
      maxInterval: 2,
      getStageIndex: () => 5,
    });

    for (const anchor of anchors) {
      const normalized = anchor.words.map((word) =>
        word.vi.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\W/g, '').toLowerCase(),
      );
      expect(normalized[0]).not.toBe(normalized[1]);
    }
  });
});

describe('computeGameAnchors bubbleChoice levels', () => {
  const onlyBubbles = {
    includeGameTypes: ['bubbleChoice'] as const,
    excludeGameTypes: ['matching'] as const,
    minInterval: 2,
    maxInterval: 2,
  };

  it('uses all three similarity levels as the repetition stage advances', () => {
    const words = Array.from({ length: 20 }, (_, index) =>
      makeWord(
        `bubble-${index}`,
        `known${String.fromCharCode(97 + index)}`,
        `aaaaa${String.fromCharCode(97 + index)}`,
      ),
    );

    const levels = ([0, 3, 5] as const).map((stage) => {
      const anchors = computeGameAnchorsRaw(words, [], 17, {
        ...onlyBubbles,
        getStageIndex: () => stage,
      });
      expect(anchors.length).toBeGreaterThan(0);
      expect(anchors.every((anchor) => anchor.gameType === 'bubbleChoice')).toBe(true);
      return {
        scores: new Set(anchors.map((anchor) => anchor.level)),
        bands: new Set(anchors.map((anchor) => anchor.difficultyBand)),
      };
    });

    expect(levels[0]).toEqual({ scores: new Set([1]), bands: new Set(['I']) });
    expect(levels[1]).toEqual({ scores: new Set([2]), bands: new Set(['II']) });
    expect(levels[2]).toEqual({ scores: new Set([3]), bands: new Set(['III']) });
  });

  it('can insert bubbles after three cards even when matching is unavailable', () => {
    const words = Array.from({ length: 16 }, (_, index) =>
      makeWord(`late-${index}`, `known-${index}`, `learning-${index}`),
    );
    const stream = injectMinigamesRaw(words, [], 23, {
      includeGameTypes: ['bubbleChoice'],
      minInterval: 3,
      maxInterval: 3,
      getStageIndex: () => 7,
    });

    let cardsSinceQuiz = 0;
    let quizzes = 0;
    for (const item of stream) {
      if ('_isMinigame' in item) {
        expect(item.gameType).toBe('bubbleChoice');
        expect(cardsSinceQuiz).toBeLessThanOrEqual(3);
        cardsSinceQuiz = 0;
        quizzes += 1;
      } else {
        cardsSinceQuiz += 1;
      }
    }
    expect(quizzes).toBeGreaterThan(0);
  });
});
