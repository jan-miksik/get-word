import type { NormalizedWord } from '@/lib/words';

import { buildSimilarPairs, hasAtLeastOneSimilarPair } from './similarity';
import type {
  GameAnchor,
  GameDifficultyLevel,
  GameType,
  InjectMinigamesOptions,
} from './types';

const GAME_TYPES: GameType[] = ['multipleChoice', 'typing', 'matching'];
const STRUCTURAL_CATEGORIES = new Set(['word', 'phrase']);

function getLearningCategories(word: NormalizedWord): string[] {
  return word.category.filter((category) => !STRUCTURAL_CATEGORIES.has(category));
}

function sharesLearningScope(anchor: NormalizedWord, candidate: NormalizedWord): boolean {
  const anchorCategories = getLearningCategories(anchor);
  const candidateCategories = getLearningCategories(candidate);

  if (anchorCategories.length === 0 || candidateCategories.length === 0) {
    return anchorCategories.length === candidateCategories.length;
  }

  const candidateSet = new Set(candidateCategories);
  return anchorCategories.some((category) => candidateSet.has(category));
}

function buildGameWordPool(
  originalWords: NormalizedWord[],
  anchorIndex: number,
  streamAboveWindow: number,
): NormalizedWord[] {
  const anchorWord = originalWords[anchorIndex];
  const pool = originalWords.slice(
    Math.max(0, anchorIndex + 1 - streamAboveWindow),
    anchorIndex + 1,
  );

  if (pool.length >= 4 || !anchorWord) return pool;

  const selectedIds = new Set(pool.map((word) => word.id));
  const scopedSurrounding: NormalizedWord[] = [];
  const fallbackSurrounding: NormalizedWord[] = [];

  const collect = (word: NormalizedWord | undefined) => {
    if (!word || selectedIds.has(word.id)) return;
    selectedIds.add(word.id);
    if (sharesLearningScope(anchorWord, word)) scopedSurrounding.push(word);
    else fallbackSurrounding.push(word);
  };

  for (let distance = 1; pool.length + scopedSurrounding.length < 4; distance += 1) {
    const beforeIndex = anchorIndex - distance;
    const afterIndex = anchorIndex + distance;
    if (beforeIndex < 0 && afterIndex >= originalWords.length) break;

    collect(originalWords[afterIndex]);
    collect(originalWords[beforeIndex]);
  }

  const scopedPool = [...pool, ...scopedSurrounding];
  return scopedPool.length >= 4 ? scopedPool : [...scopedPool, ...fallbackSurrounding];
}

export function computeGameAnchors(
  originalWords: NormalizedWord[],
  _learnedPool: NormalizedWord[],
  seed: number,
  options?: InjectMinigamesOptions,
): GameAnchor[] {
  if (originalWords.length === 0) return [];

  const baseSeed = seed;
  const normalizeSeed = (raw: number) => {
    const mod = 2147483647;
    const normalized = Math.floor(raw) % mod;
    return normalized <= 0 ? normalized + (mod - 1) : normalized;
  };

  const createRng = (rawSeed: number) => {
    let state = normalizeSeed(rawSeed);
    return () => {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    };
  };

  const mixSeed = (seedA: number, seedB: number) => {
    let mixed = (normalizeSeed(seedA) ^ normalizeSeed(seedB)) >>> 0;
    mixed ^= mixed >>> 16;
    mixed = Math.imul(mixed, 0x7feb352d);
    mixed ^= mixed >>> 15;
    mixed = Math.imul(mixed, 0x846ca68b);
    mixed ^= mixed >>> 16;
    return normalizeSeed(mixed);
  };

  let minInterval = 5;
  let maxInterval = 10;
  if (options?.minInterval !== undefined || options?.maxInterval !== undefined) {
    const minRaw = options.minInterval ?? 2;
    const maxRaw = options.maxInterval ?? options.minInterval ?? 10;
    minInterval = Math.max(1, Math.min(50, Math.floor(minRaw)));
    maxInterval = Math.max(minInterval, Math.min(100, Math.floor(maxRaw)));
  }

  const randGap = createRng(baseSeed);
  const pickGap = () =>
    minInterval + Math.floor(randGap() * (maxInterval - minInterval + 1));

  const pickGameType = (
    slotIndex: number,
    previousType: GameType | null,
    rand: () => number,
  ): GameType => {
    const options = previousType ? GAME_TYPES.filter((type) => type !== previousType) : GAME_TYPES;
    return options[Math.floor(rand() * options.length)] ?? GAME_TYPES[slotIndex % GAME_TYPES.length];
  };

  const anchorIndices: number[] = [];
  let wordCount = 0;
  let nextGap = pickGap();
  for (let i = 0; i < originalWords.length; i += 1) {
    wordCount += 1;
    if (wordCount >= nextGap) {
      wordCount = 0;
      anchorIndices.push(i);
      nextGap = pickGap();
    }
  }

  const streamAboveWindow = 14;

  const pickDistinctWords = (pool: NormalizedWord[], rand: () => number): NormalizedWord[] => {
    const total = pool.length;
    if (total <= 4) return pool.slice(0, 4);

    const picked = new Set<number>();
    const output: NormalizedWord[] = [];
    while (output.length < 4) {
      const index = Math.floor(rand() * total);
      if (picked.has(index)) continue;
      picked.add(index);
      output.push(pool[index]);
    }
    return output;
  };

  const signatureOf = (words: NormalizedWord[]) => words.map((word) => word.id).sort().join('|');

  const pickLevel2DistinctWords = (
    pool: NormalizedWord[],
    similarPairs: Array<[number, number]>,
    rand: () => number,
  ): NormalizedWord[] | null => {
    if (pool.length < 4 || similarPairs.length === 0) return null;

    const pair = similarPairs[Math.floor(rand() * similarPairs.length)];
    if (!pair) return null;

    const picked = new Set<number>(pair);
    const output: NormalizedWord[] = [pool[pair[0]], pool[pair[1]]];
    const total = pool.length;
    let guard = 0;

    while (output.length < 4 && guard < total * 6) {
      const index = Math.floor(rand() * total);
      guard += 1;
      if (picked.has(index)) continue;
      picked.add(index);
      output.push(pool[index]);
    }

    if (output.length < 4) return null;

    for (let i = output.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [output[i], output[j]] = [output[j], output[i]];
    }

    return hasAtLeastOneSimilarPair(output) ? output : null;
  };

  let lastSignature: string | null = null;
  let lastGameType: GameType | null = null;
  const anchors: Array<GameAnchor | null> = [];

  for (let slotIndex = 0; slotIndex < anchorIndices.length; slotIndex += 1) {
    const anchorIndex = anchorIndices[slotIndex];
    const randType = createRng(mixSeed(baseSeed, mixSeed(anchorIndex + 1, 8000 + slotIndex)));
    const gameType = pickGameType(slotIndex, lastGameType, randType);

    const pool = buildGameWordPool(originalWords, anchorIndex, streamAboveWindow);

    if (pool.length < 4) {
      anchors.push(null);
      continue;
    }

    const anchorId = `game-${originalWords[anchorIndex].id}-s${baseSeed}`;
    const similarPairs = buildSimilarPairs(pool);
    const level2Eligible =
      (gameType === 'multipleChoice' || gameType === 'matching') &&
      similarPairs.length > 0;

    let attempt = 0;
    let chosen: NormalizedWord[] | null = null;
    let chosenLevel: GameDifficultyLevel = 1;
    let signature = '';

    while (attempt < 4) {
      const randPick = createRng(mixSeed(baseSeed, mixSeed(anchorIndex + 1, attempt + 1)));
      const randLevel = createRng(mixSeed(baseSeed, mixSeed(anchorIndex + 1, 5000 + attempt)));
      const shouldAttemptLevel2 = level2Eligible && randLevel() < 0.5;
      const level2Candidate = shouldAttemptLevel2
        ? pickLevel2DistinctWords(pool, similarPairs, randPick)
        : null;
      const candidate = level2Candidate ?? pickDistinctWords(pool, randPick);
      const candidateLevel: GameDifficultyLevel = level2Candidate ? 2 : 1;
      signature = signatureOf(candidate);

      if (signature !== lastSignature) {
        chosen = candidate;
        chosenLevel = candidateLevel;
        break;
      }

      attempt += 1;
    }

    if (!chosen) {
      const randPick = createRng(mixSeed(baseSeed, mixSeed(anchorIndex + 1, 999)));
      const fallback = pickDistinctWords(pool, randPick);
      chosen = fallback;
      signature = signatureOf(fallback);
      chosenLevel = 1;
    }

    lastSignature = signature;
    lastGameType = gameType;
    anchors.push({
      id: anchorId,
      gameType,
      level: chosenLevel,
      words: chosen,
      anchorOriginalIndex: anchorIndex,
    });
  }

  return anchors.filter((anchor): anchor is GameAnchor => anchor !== null);
}
