import type { NormalizedWord } from '@/lib/words';

import {
  buildSimilarPairs,
  hasAtLeastOneSimilarPair,
  type SimilarityBand,
} from './similarity';
import { isAuthoredSentence } from '@/lib/formatting-polish';
import { hasDistinctVisibleAnswers, sharesLearningScope } from './word-pool';
import {
  DEFAULT_FINE_TUNE_CONFIG,
  stageConfigAt,
} from '@/features/learning/fine-tune/config';
import { pickMatchRound } from '@/features/learning/fine-tune/pick';
import {
  canBuildVariant,
  resolveVariantDistractors,
} from '@/features/learning/fine-tune/distractors';
import { parseMatchVariant } from '@/features/learning/fine-tune/types';
import type {
  GameAnchor,
  GameDifficultyLevel,
  GameType,
  InjectMinigamesOptions,
} from './types';

// Multiple choice and typing are study cards now, not interludes: scheduling
// them between cards as well would grade the same word twice, since the anchor
// pool is drawn from words the learner has just answered. Matching stays, and
// stays score-only — one round covers 2–6 words, so no single word's stage can
// be attributed to the result.
const GAME_TYPES: GameType[] = ['matching'];
const MIN_POOL_SIZE: Record<GameType, number> = {
  multipleChoice: 4,
  typing: 4,
  matching: 2,
  tiltChoice: 2,
  bubbleChoice: 4,
  similarWordsPrompt: 1,
};
// The tilt card renders the prompt on the seesaw plank and both answers in the
// bottom corners, so long phrases overflow the layout. Either study direction
// may be shown, which is why both sides must stay short.
const TILT_MAX_TEXT_LENGTH = 18;

/** Bubbles on screen = these plus the answer itself. */
const BUBBLE_DISTRACTORS = 9;
const BUBBLE_MIN_DISTRACTORS = 3;

/**
 * Whether asking for words similar to this one makes any sense.
 *
 * Sentences are excluded: "similar sentences" is not a thing a learner wants,
 * and the generator would answer it with paraphrases rather than with the
 * confusable neighbours the distractor pool is actually short of.
 */
function isSimilarWordsCandidate(word: NormalizedWord): boolean {
  const known = (word.cz ?? '').trim();
  const learning = (word.vi ?? '').trim();
  if (!known || !learning) return false;
  return !isAuthoredSentence(known, word.languageFrom ?? 'cs')
    && !isAuthoredSentence(learning, word.languageTo ?? 'vi');
}

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

  const pickBubbleWords = (
    pool: NormalizedWord[],
    anchor: NormalizedWord,
    rand: () => number,
  ): { words: NormalizedWord[]; level: GameDifficultyLevel; difficultyBand: SimilarityBand } | null => {
    const stage = options?.getStageIndex?.(anchor.id) ?? 0;
    const requestedBand = stage >= 5 ? 'III' : stage >= 3 ? 'II' : 'I';
    // A bubble field wants to look like a field, not like a four-option quiz.
    // Short lists still get a playable round: the count degrades to whatever
    // the pool can actually supply rather than dropping the game entirely.
    const count = Math.max(BUBBLE_MIN_DISTRACTORS, Math.min(BUBBLE_DISTRACTORS, pool.length - 1));
    const resolved = resolveVariantDistractors({
      target: anchor,
      pool,
      count,
      band: requestedBand,
      // Only a couple of genuine near-twins are needed to make the field read
      // carefully; demanding nine of them would be unsatisfiable on real lists.
      minInBand: () => requestedBand === 'I' ? 0 : requestedBand === 'II' ? 2 : 3,
      random: rand,
    });
    if (!resolved) return null;
    const level: GameDifficultyLevel = resolved.effectiveBand === 'III'
      ? 3
      : resolved.effectiveBand === 'II'
        ? 2
        : 1;
    return {
      words: [anchor, ...resolved.distractors],
      level,
      difficultyBand: resolved.effectiveBand,
    };
  };

  const canPlayMatching = (
    pool: NormalizedWord[],
    anchor: NormalizedWord,
  ): boolean => {
    const roundStage = pool.reduce(
      (highest, word) => Math.max(highest, options?.getStageIndex?.(word.id) ?? 0),
      0,
    );
    const variants = stageConfigAt(
      options?.fineTuneConfig ?? DEFAULT_FINE_TUNE_CONFIG,
      roundStage,
    ).match.variants;
    return variants.some((variant) => canBuildVariant({
      target: anchor,
      pool,
      count: parseMatchVariant(variant).pairs - 1,
    }));
  };

  let lastSignature: string | null = null;
  let lastGameType: GameType | null = null;
  const anchors: Array<GameAnchor | null> = [];

  for (let slotIndex = 0; slotIndex < anchorIndices.length; slotIndex += 1) {
    const anchorIndex = anchorIndices[slotIndex];
    const pool = buildGameWordPool(originalWords, anchorIndex, streamAboveWindow);
    const candidatesForPool = availableGameTypes.filter(
      (type) =>
        pool.length >= MIN_POOL_SIZE[type] &&
        (type !== 'matching' || canPlayMatching(pool, originalWords[anchorIndex])) &&
        (type !== 'similarWordsPrompt'
          || (!hasAtLeastOneSimilarPair(pool) && isSimilarWordsCandidate(originalWords[anchorIndex]))),
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
    let chosenDifficultyBand: SimilarityBand | undefined;
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

      if (gameType === 'bubbleChoice') {
        const bubbleCandidate = pickBubbleWords(pool, originalWords[anchorIndex], randPick);
        if (!bubbleCandidate) break;
        chosen = bubbleCandidate.words;
        chosenLevel = bubbleCandidate.level;
        chosenDifficultyBand = bubbleCandidate.difficultyBand;
        signature = signatureOf(chosen);
        if (signature !== lastSignature) break;
        chosen = null;
        attempt += 1;
        continue;
      }

      if (gameType === 'similarWordsPrompt') {
        chosen = [originalWords[anchorIndex]];
        chosenLevel = 1;
        signature = `similar-words:${chosen[0].id}`;
        break;
      }

      if (gameType === 'matching') {
        // Pair count and distractor similarity come from the stage of the word
        // the round is anchored to, so matching gets harder alongside everything
        // else — even though its result never moves a stage.
        // A round covers 2–6 words, so its difficulty follows the most advanced
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
        chosenDifficultyBand = round.effectiveBand;
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
      } else if (gameType === 'bubbleChoice') {
        const fallback = pickBubbleWords(pool, originalWords[anchorIndex], randPick);
        if (!fallback) {
          anchors.push(null);
          continue;
        }
        chosen = fallback.words;
        signature = signatureOf(fallback.words);
        chosenLevel = fallback.level;
        chosenDifficultyBand = fallback.difficultyBand;
      } else if (gameType === 'similarWordsPrompt') {
        chosen = [originalWords[anchorIndex]];
        signature = `similar-words:${chosen[0].id}`;
        chosenLevel = 1;
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
      difficultyBand: chosenDifficultyBand,
      stageIndex: options?.getStageIndex?.(chosen[0].id) ?? 0,
      words: chosen,
      anchorOriginalIndex: anchorIndex,
    });
  }

  return anchors.filter((anchor): anchor is GameAnchor => anchor !== null);
}
