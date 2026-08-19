import type { NormalizedWord } from '@/lib/words';

import { buildSimilarPairs, hasAtLeastOneSimilarPair } from './similarity';
import { hasDistinctVisibleAnswers, sharesLearningScope } from './word-pool';
import { DEFAULT_FINE_TUNE_CONFIG } from '@/features/learning/fine-tune/config';
import { pickMatchRound } from '@/features/learning/fine-tune/pick';
import type {
  GameAnchor,
  GameDifficultyLevel,
  GameType,
  InjectMinigamesOptions,
} from './types';

// Multiple choice and typing are study cards now, not interludes: scheduling
// them between cards as well would grade the same word twice, since the anchor
// pool is drawn from words the learner has just answered. Matching stays, and
// stays score-only — one round covers 4–8 words, so no single word's stage can
// be attributed to the result.
const GAME_TYPES: GameType[] = ['matching'];
const MIN_POOL_SIZE: Record<GameType, number> = {
  multipleChoice: 4,
  typing: 4,
  matching: 4,
  tiltChoice: 2,
};
// The tilt card renders the prompt on the seesaw plank and both answers in the
// bottom corners, so long phrases overflow the layout. Either study direction
// may be shown, which is why both sides must stay short.
const TILT_MAX_TEXT_LENGTH = 18;

function isTiltEligibleWord(word: NormalizedWord): boolean {
  return (
    word.cz.trim().length <= TILT_MAX_TEXT_LENGTH &&
    word.vi.trim().length <= TILT_MAX_TEXT_LENGTH
  );
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

  const excludedTypes = new Set(options?.excludeGameTypes ?? []);
  const availableGameTypes = Array.from(
    new Set([...GAME_TYPES, ...(options?.includeGameTypes ?? [])]),
  ).filter((type) => !excludedTypes.has(type));
  if (availableGameTypes.length === 0) return [];

  const randGap = createRng(baseSeed);
  const pickGap = () =>
    minInterval + Math.floor(randGap() * (maxInterval - minInterval + 1));

  const pickGameType = (
    slotIndex: number,
    previousType: GameType | null,
    rand: () => number,
    candidatesForPool: GameType[],
  ): GameType => {
    const candidates =
      previousType && candidatesForPool.length > 1
        ? candidatesForPool.filter((type) => type !== previousType)
        : candidatesForPool;
    return (
      candidates[Math.floor(rand() * candidates.length)] ??
      candidatesForPool[slotIndex % candidatesForPool.length]
    );
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

  const pickTiltChoiceWords = (
    pool: NormalizedWord[],
    similarPairs: Array<[number, number]>,
    rand: () => number,
  ): { words: NormalizedWord[]; level: GameDifficultyLevel } | null => {
    const eligibleIndexes = pool
      .map((_, index) => index)
      .filter((index) => isTiltEligibleWord(pool[index]));
    if (eligibleIndexes.length < MIN_POOL_SIZE.tiltChoice) return null;
    const eligibleSet = new Set(eligibleIndexes);

    const firstCorrectOffset = Math.floor(rand() * eligibleIndexes.length);
    for (let offset = 0; offset < eligibleIndexes.length; offset += 1) {
      const correctIndex = eligibleIndexes[(firstCorrectOffset + offset) % eligibleIndexes.length];
      const correct = pool[correctIndex];
      const validPartners = similarPairs
        .flatMap(([left, right]) => {
          if (left === correctIndex) return [right];
          if (right === correctIndex) return [left];
          return [];
        })
        .filter(
          (index) => eligibleSet.has(index) && hasDistinctVisibleAnswers(correct, pool[index]),
        );

      if ((options?.getStageIndex?.(correct.id) ?? 0) >= 3 && validPartners.length > 0) {
        const partnerIndex = validPartners[Math.floor(rand() * validPartners.length)];
        return { words: [correct, pool[partnerIndex]], level: 2 };
      }

      const validDistractors = eligibleIndexes.filter(
        (index) => index !== correctIndex && hasDistinctVisibleAnswers(correct, pool[index]),
      );
      if (validDistractors.length > 0) {
        const distractorIndex = validDistractors[Math.floor(rand() * validDistractors.length)];
        return { words: [correct, pool[distractorIndex]], level: 1 };
      }
    }

    return null;
  };

  let lastSignature: string | null = null;
  let lastGameType: GameType | null = null;
  const anchors: Array<GameAnchor | null> = [];

  for (let slotIndex = 0; slotIndex < anchorIndices.length; slotIndex += 1) {
    const anchorIndex = anchorIndices[slotIndex];
    const pool = buildGameWordPool(originalWords, anchorIndex, streamAboveWindow);
    const candidatesForPool = availableGameTypes.filter(
      (type) => pool.length >= MIN_POOL_SIZE[type],
    );
    if (candidatesForPool.length === 0) {
      anchors.push(null);
      continue;
    }

    const randType = createRng(mixSeed(baseSeed, mixSeed(anchorIndex + 1, 8000 + slotIndex)));
    const gameType = pickGameType(slotIndex, lastGameType, randType, candidatesForPool);

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
      if (gameType === 'tiltChoice') {
        const tiltCandidate = pickTiltChoiceWords(pool, similarPairs, randPick);
        if (!tiltCandidate) break;
        chosen = tiltCandidate.words;
        chosenLevel = tiltCandidate.level;
        signature = signatureOf(chosen);
        if (signature !== lastSignature) break;
        chosen = null;
        attempt += 1;
        continue;
      }

      if (gameType === 'matching') {
        // Pair count and distractor similarity come from the stage of the word
        // the round is anchored to, so matching gets harder alongside everything
        // else — even though its result never moves a stage.
        // A round covers 4–8 words, so its difficulty follows the most advanced
        // word in it rather than the anchor alone. A round made purely of
        // brand-new words gets no matching at all, which is what the default
        // preset asks for: matching is review practice, not an introduction.
        const roundStage = pool.reduce(
          (highest, word) => Math.max(highest, options?.getStageIndex?.(word.id) ?? 0),
          0,
        );
        const round = pickMatchRound({
          anchor: originalWords[anchorIndex],
          stageIndex: roundStage,
          config: options?.fineTuneConfig ?? DEFAULT_FINE_TUNE_CONFIG,
          pool,
          seed: mixSeed(baseSeed, mixSeed(anchorIndex + 1, 6000 + attempt)),
        });
        if (!round) break;
        chosen = round.words;
        chosenLevel = round.effectiveBand === 'I' ? 1 : 2;
        signature = signatureOf(chosen);
        if (signature !== lastSignature) break;
        chosen = null;
        attempt += 1;
        continue;
      }

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
      if (gameType === 'matching') {
        // No usable variant for this stage (the long intervals drop matching
        // entirely in the default preset) — leave the slot empty rather than
        // inventing a round the settings did not ask for.
        anchors.push(null);
        continue;
      }
      if (gameType === 'tiltChoice') {
        const fallback = pickTiltChoiceWords(pool, similarPairs, randPick);
        if (!fallback) {
          anchors.push(null);
          continue;
        }
        chosen = fallback.words;
        signature = signatureOf(fallback.words);
        chosenLevel = fallback.level;
      } else {
        const fallback = pickDistinctWords(pool, randPick);
        chosen = fallback;
        signature = signatureOf(fallback);
        chosenLevel = 1;
      }
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
