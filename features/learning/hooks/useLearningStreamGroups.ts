'use client';

import { useMemo, useState } from 'react';

import {
  composeStream,
  computeGameAnchors,
  enforceMinigameMinGap,
  pruneAnchorsForCurrentSize,
  type GameAnchor,
  type GameType,
  type MiniGameConfig,
  type MinigameFrequencyRange,
} from '@/features/learning/minigames';
import { STAGES, type NormalizedWord } from '@/lib/words';

type SegmentKind = 'repeat' | 'settling' | 'new';

type SegmentPlan = {
  resetKey: string;
  configKey: string;
  learnedPoolSig: string;
  originalWords: NormalizedWord[];
  originalIndexMap: Map<string, number>;
  anchors: GameAnchor[];
};

function emptySegmentPlans(): Record<SegmentKind, SegmentPlan | null> {
  return {
    repeat: null,
    settling: null,
    new: null,
  };
}

class SegmentPlanCache {
  private plans = emptySegmentPlans();

  get(kind: SegmentKind): SegmentPlan | null {
    return this.plans[kind];
  }

  set(kind: SegmentKind, plan: SegmentPlan): void {
    this.plans[kind] = plan;
  }

  reset(): void {
    this.plans = emptySegmentPlans();
  }
}

type UseLearningStreamGroupsArgs = {
  dueWords: NormalizedWord[];
  newWords: NormalizedWord[];
  settlingWords: NormalizedWord[];
  showNotReady: boolean;
  learnedPool: NormalizedWord[];
  isHydrated: boolean;
  minigameFrequency: MinigameFrequencyRange;
  dismissedGames: Set<string>;
  minigameSeed: number;
  selectedCategoriesKey: string;
  wordsResetKey: string;
  excludeGameTypes?: GameType[];
  includeGameTypes?: GameType[];
  getStageIndex?: (wordId: string) => number;
  progressPlanRevision?: string | number;
};

export function useLearningStreamGroups({
  dueWords,
  newWords,
  settlingWords,
  showNotReady,
  learnedPool,
  isHydrated,
  minigameFrequency,
  dismissedGames,
  minigameSeed,
  selectedCategoriesKey,
  wordsResetKey,
  excludeGameTypes,
  includeGameTypes,
  getStageIndex,
  progressPlanRevision = 0,
}: UseLearningStreamGroupsArgs) {
  const [planCache] = useState(() => new SegmentPlanCache());

  const combined = useMemo(
    () => [...dueWords, ...(showNotReady ? settlingWords : []), ...newWords],
    [dueWords, settlingWords, newWords, showNotReady],
  );

  // Key the exclusion by value so a fresh array identity per render doesn't
  // recompute plans, while an actual toggle (e.g. typing mode) does.
  const excludeGameTypesKey = (excludeGameTypes ?? []).slice().sort().join(',');
  const stableExcludeGameTypes = useMemo(
    () => (excludeGameTypesKey ? (excludeGameTypesKey.split(',') as GameType[]) : []),
    [excludeGameTypesKey],
  );
  const includeGameTypesKey = Array.from(new Set(includeGameTypes ?? [])).sort().join(',');
  const stableIncludeGameTypes = useMemo(
    () => (includeGameTypesKey ? (includeGameTypesKey.split(',') as GameType[]) : []),
    [includeGameTypesKey],
  );

  const streamGroupedWords = useMemo(() => {
    const groups: (NormalizedWord | MiniGameConfig)[][] = STAGES.map(() => []);
    if (!isHydrated) return groups;

    let wordStream: (NormalizedWord | MiniGameConfig)[];
    if (minigameFrequency === 'off') {
      wordStream = combined;
    } else {
      const { min, max } = minigameFrequency;
      if (combined.length === 0) {
        wordStream = [];
      } else {
        const baseResetKey = `${selectedCategoriesKey}|${wordsResetKey}`;
        const learnedPoolSig = `${learnedPool.length}:${learnedPool
          .slice(0, 12)
          .map((word) => word.id)
          .join(',')}`;

        const segmentSeed = (kind: SegmentKind) => {
          if (kind === 'repeat') return minigameSeed;
          if (kind === 'settling') return minigameSeed + 10007;
          return minigameSeed + 20011;
        };

        const injectSegment = (kind: SegmentKind, words: NormalizedWord[]) => {
          if (words.length === 0) return [] as (NormalizedWord | MiniGameConfig)[];

          const seed = segmentSeed(kind);
          const configKey = `${seed}|${min}|${max}|${excludeGameTypesKey}|${includeGameTypesKey}|${progressPlanRevision}`;
          const resetKey = `${baseResetKey}|${kind}`;
          const existing = planCache.get(kind);

          const plan =
            existing &&
            existing.resetKey === resetKey &&
            existing.configKey === configKey
              ? existing
              : {
                  resetKey,
                  configKey,
                  learnedPoolSig,
                  originalWords: [...words],
                  originalIndexMap: new Map(words.map((word, index) => [word.id, index])),
                  anchors: [] as GameAnchor[],
                };

          let appended = false;
          for (const word of words) {
            if (!plan.originalIndexMap.has(word.id)) {
              plan.originalIndexMap.set(word.id, plan.originalWords.length);
              plan.originalWords.push(word);
              appended = true;
            }
          }

          if (!existing || plan !== existing || appended || plan.learnedPoolSig !== learnedPoolSig) {
            plan.learnedPoolSig = learnedPoolSig;
            plan.anchors = computeGameAnchors(plan.originalWords, learnedPool, seed, {
              minInterval: min,
              maxInterval: max,
              excludeGameTypes: stableExcludeGameTypes,
              includeGameTypes: stableIncludeGameTypes,
              getStageIndex,
            });
          }

          planCache.set(kind, plan);

          let maxOrigIdx = Number.NEGATIVE_INFINITY;
          for (const word of words) {
            const originalIndex = plan.originalIndexMap.get(word.id);
            if (typeof originalIndex !== 'number' || !Number.isFinite(originalIndex)) continue;
            if (originalIndex > maxOrigIdx) maxOrigIdx = originalIndex;
          }

          if (!Number.isFinite(maxOrigIdx)) maxOrigIdx = 0;

          const windowedAnchors = plan.anchors.filter(
            (anchor) => anchor.anchorOriginalIndex <= maxOrigIdx,
          );

          const anchorsForCompose =
            dismissedGames.size > 0
              ? windowedAnchors.filter((anchor) => !dismissedGames.has(anchor.id))
              : windowedAnchors;

          const prunedAnchors = pruneAnchorsForCurrentSize(anchorsForCompose, words.length, min);
          return composeStream(words, plan.originalIndexMap, prunedAnchors);
        };

        wordStream = [
          ...injectSegment('repeat', dueWords),
          ...injectSegment('settling', showNotReady ? settlingWords : []),
          ...injectSegment('new', newWords),
        ];
      }
    }

    if (dismissedGames.size > 0) {
      wordStream = wordStream.filter(
        (item) => !('_isMinigame' in item) || !dismissedGames.has(item.id),
      );
    }

    if (minigameFrequency !== 'off') {
      wordStream = enforceMinigameMinGap(wordStream, minigameFrequency.min);
    }

    const repeatCount = dueWords.length + (showNotReady ? settlingWords.length : 0);
    let wordsSeen = 0;
    for (const item of wordStream) {
      if (!('_isMinigame' in item)) wordsSeen += 1;
      if (wordsSeen <= repeatCount) groups[0].push(item);
      else groups[1].push(item);
    }

    return groups;
  }, [
    combined,
    dismissedGames,
    dueWords,
    excludeGameTypesKey,
    includeGameTypesKey,
    stableExcludeGameTypes,
    stableIncludeGameTypes,
    getStageIndex,
    isHydrated,
    learnedPool,
    minigameFrequency,
    minigameSeed,
    newWords,
    planCache,
    progressPlanRevision,
    selectedCategoriesKey,
    settlingWords,
    showNotReady,
    wordsResetKey,
  ]);

  return {
    resetStablePlans() {
      planCache.reset();
    },
    streamGroupedWords,
  };
}
