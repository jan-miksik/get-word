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
import type { FineTuneConfig } from '@/features/learning/fine-tune/types';

type SegmentKind = 'priority' | 'repeat' | 'settling' | 'new';

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
    priority: null,
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
  /** The learner's own pinned-category words; served before due repeats. */
  priorityWords: NormalizedWord[];
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
  fineTuneConfig?: FineTuneConfig;
  progressPlanRevision?: string | number;
};

export function useLearningStreamGroups({
  priorityWords,
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
  fineTuneConfig,
  progressPlanRevision = 0,
}: UseLearningStreamGroupsArgs) {
  const [planCache] = useState(() => new SegmentPlanCache());

  const combined = useMemo(
    () => [...priorityWords, ...dueWords, ...(showNotReady ? settlingWords : []), ...newWords],
    [priorityWords, dueWords, settlingWords, newWords, showNotReady],
  );

  // Key the exclusion by value so a fresh array identity per render doesn't
  // recompute plans, while an actual toggle (e.g. typing mode) does.
  const excludeGameTypesKey = (excludeGameTypes ?? []).slice().sort().join(',');
  const stableExcludeGameTypes = useMemo(
    () => (excludeGameTypesKey ? (excludeGameTypesKey.split(',') as GameType[]) : []),
    [excludeGameTypesKey],
  );
  const includeGameTypesKey = Array.from(new Set(includeGameTypes ?? [])).sort().join(',');
  // Anchor plans are cached per segment, so changing the learning settings has
  // to invalidate them or the old matching variants would stick around.
  const fineTuneKey = useMemo(
    () => (fineTuneConfig ? JSON.stringify(fineTuneConfig.stages.map((stage) => stage.match.variants)) : ''),
    [fineTuneConfig],
  );
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
          if (kind === 'priority') return minigameSeed + 30013;
          if (kind === 'repeat') return minigameSeed;
          if (kind === 'settling') return minigameSeed + 10007;
          return minigameSeed + 20011;
        };

        const injectSegment = (kind: SegmentKind, words: NormalizedWord[]) => {
          if (words.length === 0) return [] as (NormalizedWord | MiniGameConfig)[];

          const seed = segmentSeed(kind);
          const configKey = `${seed}|${min}|${max}|${excludeGameTypesKey}|${includeGameTypesKey}|${fineTuneKey}|${progressPlanRevision}`;
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
              fineTuneConfig,
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
          ...injectSegment('priority', priorityWords),
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

    // Priority words head the "ready now" group: they are what the learner just
    // asked for, so burying them under a "new words" heading would defeat the
    // point of prioritising them at all.
    const repeatCount =
      priorityWords.length + dueWords.length + (showNotReady ? settlingWords.length : 0);
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
    fineTuneConfig,
    fineTuneKey,
    minigameFrequency,
    minigameSeed,
    newWords,
    planCache,
    priorityWords,
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
