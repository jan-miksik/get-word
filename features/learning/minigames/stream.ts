import type { NormalizedWord } from '@/lib/words';

import { computeGameAnchors } from './anchors';
import type { GameAnchor, InjectMinigamesOptions, MiniGameConfig, StreamItem } from './types';

export function composeStream(
  currentWords: NormalizedWord[],
  originalIndexMap: Map<string, number>,
  anchors: GameAnchor[],
): StreamItem[] {
  if (currentWords.length === 0) return [];
  if (anchors.length === 0) return [...currentWords];

  const sortedAnchors = [...anchors].sort((a, b) => a.anchorOriginalIndex - b.anchorOriginalIndex);
  const wordsWithOrigIdx = currentWords.map((word) => ({
    word,
    origIdx: originalIndexMap.get(word.id) ?? -1,
  }));

  const insertions = new Map<number, GameAnchor[]>();
  const usedSlots = new Set<number>();
  const maxIndex = wordsWithOrigIdx.length - 1;
  const totalSlots = currentWords.length + 1;

  for (const anchor of sortedAnchors) {
    if (usedSlots.size >= totalSlots) break;

    let bestOrigIdx = Number.NEGATIVE_INFINITY;
    let bestIdx = -1;
    for (let i = 0; i < wordsWithOrigIdx.length; i += 1) {
      const origIdx = wordsWithOrigIdx[i].origIdx;
      if (origIdx < 0) continue;
      if (origIdx <= anchor.anchorOriginalIndex && origIdx >= bestOrigIdx) {
        bestOrigIdx = origIdx;
        bestIdx = i;
      }
    }

    let target = Math.max(-1, Math.min(maxIndex, bestIdx));
    if (usedSlots.has(target)) {
      let found = false;
      for (let candidate = target + 1; candidate <= maxIndex; candidate += 1) {
        if (!usedSlots.has(candidate)) {
          target = candidate;
          found = true;
          break;
        }
      }

      if (!found) {
        for (let candidate = target - 1; candidate >= -1; candidate -= 1) {
          if (!usedSlots.has(candidate)) {
            target = candidate;
            found = true;
            break;
          }
        }
      }

      if (!found) continue;
    }

    usedSlots.add(target);
    const bucket = insertions.get(target) ?? [];
    bucket.push(anchor);
    insertions.set(target, bucket);
  }

  const toConfig = (anchor: GameAnchor): MiniGameConfig => ({
    _isMinigame: true,
    id: anchor.id,
    gameType: anchor.gameType,
    level: anchor.level,
    difficultyBand: anchor.difficultyBand,
    stageIndex: anchor.stageIndex,
    words: anchor.words,
    anchorOriginalIndex: anchor.anchorOriginalIndex,
  });

  const result: StreamItem[] = [];
  for (const anchor of insertions.get(-1) ?? []) {
    result.push(toConfig(anchor));
  }

  for (let i = 0; i < currentWords.length; i += 1) {
    result.push(currentWords[i]);
    for (const anchor of insertions.get(i) ?? []) {
      result.push(toConfig(anchor));
    }
  }

  return result;
}

export function enforceMinigameMinGap(
  stream: StreamItem[],
  minWordsBetweenGames: number,
): StreamItem[] {
  const raw = Number.isFinite(minWordsBetweenGames) ? Math.floor(minWordsBetweenGames) : 0;
  const minGap = Math.max(0, raw);
  if (minGap <= 0) return stream;

  const output: StreamItem[] = [];
  const pending: MiniGameConfig[] = [];
  let wordsSinceLastGame = minGap;

  const flushPendingIfPossible = () => {
    while (pending.length > 0 && wordsSinceLastGame >= minGap) {
      const game = pending.shift();
      if (!game) return;
      output.push(game);
      wordsSinceLastGame = 0;
    }
  };

  for (const item of stream) {
    if ('_isMinigame' in item) {
      if (wordsSinceLastGame < minGap) pending.push(item);
      else {
        output.push(item);
        wordsSinceLastGame = 0;
      }
      continue;
    }

    output.push(item);
    wordsSinceLastGame += 1;
    flushPendingIfPossible();
  }

  return output;
}

export function pruneAnchorsForCurrentSize(
  anchors: GameAnchor[],
  currentWordCount: number,
  minGap: number,
): GameAnchor[] {
  if (currentWordCount === 0) return [];
  if (minGap <= 0) return anchors;

  // A minigame is inserted between cards; it does not consume an additional
  // word from the configured gap. A pending game can also float before the
  // first remaining word after earlier cards have been learned.
  const maxGames = 1 + Math.floor(currentWordCount / minGap);
  if (anchors.length <= maxGames) return anchors;
  return anchors.slice(0, Math.max(0, maxGames));
}

export function injectMinigames(
  words: NormalizedWord[],
  learnedPool: NormalizedWord[],
  seed?: number,
  options?: InjectMinigamesOptions,
): StreamItem[] {
  if (words.length === 0) return [];

  const anchors = computeGameAnchors(words, learnedPool, seed ?? 1, options);
  if (anchors.length === 0) return [...words];

  const originalIndexMap = new Map(words.map((word, index) => [word.id, index]));
  return composeStream(words, originalIndexMap, anchors);
}
