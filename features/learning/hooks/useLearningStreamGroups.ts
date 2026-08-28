'use client';

import { useMemo, useState } from 'react';

import {
  composeStream,
  computeGameAnchors,
  enforceMinigameMinGap,
  pruneAnchorsForCurrentSize,
  type GameAnchor,
  type GameType,
  type MinigameFrequencyRange,
} from '@/features/learning/minigames';
import type { FineTuneConfig } from '@/features/learning/fine-tune/types';
import type { LearningStreamBlock, LearningStreamGroup, LearningStreamItem } from '@/features/learning/types';
import type { NormalizedWord } from '@/lib/words';

type SegmentPlan = {
  resetKey: string;
  configKey: string;
  learnedPoolSig: string;
  originalWords: NormalizedWord[];
  originalIndexMap: Map<string, number>;
  anchors: GameAnchor[];
};

class SegmentPlanCache {
  private plans = new Map<string, SegmentPlan>();

  get(key: string): SegmentPlan | undefined {
    return this.plans.get(key);
  }

  set(key: string, plan: SegmentPlan): void {
    this.plans.set(key, plan);
  }

  retain(keys: ReadonlySet<string>): void {
    for (const key of this.plans.keys()) {
      if (!keys.has(key)) this.plans.delete(key);
    }
  }

  reset(): void {
    this.plans.clear();
  }
}

export interface UseLearningStreamGroupsArgs {
  blocks: LearningStreamBlock[];
  /** Frozen keys are retained even while a word is temporarily unavailable. */
  retainedBlockKeys: readonly string[];
  settlingWords: NormalizedWord[];
  showNotReady: boolean;
  learnedPool: NormalizedWord[];
  isHydrated: boolean;
  minigameFrequency: MinigameFrequencyRange;
  dismissedGames: Set<string>;
  /** Stable identity for a stored plan; legacy streams use a scoped fallback. */
  planIdentity: string | null;
  selectedCategoriesKey: string;
  wordsResetKey: string;
  excludeGameTypes?: GameType[];
  includeGameTypes?: GameType[];
  getStageIndex?: (wordId: string) => number;
  fineTuneConfig?: FineTuneConfig;
  progressPlanRevision?: string | number;
}

function hash32(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return hash >>> 0;
}

/**
 * A derived round cannot be the final live card in a block.
 *
 * Games are rebuilt from the words still standing. If a round sits after the
 * final word, committing that word removes the source block before the deck can
 * reach the round; the rail briefly promises a game and then drops its tick.
 * Omitting only that trailing derived round keeps every offered game reachable.
 */
function dropTrailingGames(items: LearningStreamItem[]): LearningStreamItem[] {
  let length = items.length;
  while (length > 0 && '_isMinigame' in items[length - 1]) length -= 1;
  return length === items.length ? items : items.slice(0, length);
}

export function useLearningStreamGroups({
  blocks,
  retainedBlockKeys,
  settlingWords,
  showNotReady,
  learnedPool,
  isHydrated,
  minigameFrequency,
  dismissedGames,
  planIdentity,
  selectedCategoriesKey,
  wordsResetKey,
  excludeGameTypes,
  includeGameTypes,
  getStageIndex,
  fineTuneConfig,
  progressPlanRevision = 0,
}: UseLearningStreamGroupsArgs) {
  const [planCache] = useState(() => new SegmentPlanCache());
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
  const fineTuneKey = useMemo(
    () => (fineTuneConfig ? JSON.stringify(fineTuneConfig.stages.map((stage) => stage.match.variants)) : ''),
    [fineTuneConfig],
  );

  const streamGroups = useMemo<LearningStreamGroup[]>(() => {
    if (!isHydrated) return [];
    const legacyIdentity = `legacy:${selectedCategoriesKey}|${wordsResetKey}`;
    const baseIdentity = planIdentity ?? legacyIdentity;
    const liveBlocks: LearningStreamBlock[] = [
      ...blocks,
      ...(showNotReady && settlingWords.length > 0
        ? [{ key: 'settling', kind: 'settling' as const, blockIndex: blocks.length, words: settlingWords }]
        : []),
    ];
    const cacheKeyFor = (block: Pick<LearningStreamBlock, 'key' | 'kind'>) =>
      `${block.kind === 'settling' ? legacyIdentity : baseIdentity}|${block.key}`;
    const retained = new Set(
      retainedBlockKeys.map((key) => `${baseIdentity}|${key}`),
    );
    if (showNotReady && settlingWords.length > 0) retained.add(`${legacyIdentity}|settling`);
    planCache.retain(retained);

    const learnedPoolSig = `${learnedPool.length}:${learnedPool.slice(0, 12).map((word) => word.id).join(',')}`;
    const configSuffix = [
      minigameFrequency === 'off' ? 'off' : `${minigameFrequency.min}|${minigameFrequency.max}`,
      excludeGameTypesKey,
      includeGameTypesKey,
      fineTuneKey,
      progressPlanRevision,
    ].join('|');

    return liveBlocks.map((block) => {
      if (block.words.length === 0) return { ...block, items: [] };
      let items: LearningStreamItem[] = [...block.words];
      // Games belong to review, and only to review.
      //
      // A block of new words used to get them too, and because matching has no
      // variants at stage zero, the only game it could schedule was bubbles —
      // reliably. A bubble field grades every word it holds, so one round could
      // introduce nine words the learner had never seen and quietly answer the
      // repeats the day was planning to ask about, which is what pulled the
      // whole day's bookkeeping apart.
      //
      // A reinforcement block is itself the short active-recall exercise, and a
      // review minigame there could advance a word past the five-minute stage.
      const gamesAllowed = block.kind === 'review' && !block.reinforcement;
      if (minigameFrequency !== 'off' && gamesAllowed) {
        const { min, max } = minigameFrequency;
        const cacheKey = cacheKeyFor(block);
        const seed = hash32(`${baseIdentity}|${block.key}|${block.kind}`);
        const configKey = `${seed}|${min}|${max}|${configSuffix}`;
        const existing = planCache.get(cacheKey);
        const plan = existing && existing.resetKey === cacheKey && existing.configKey === configKey
          ? existing
          : {
              resetKey: cacheKey,
              configKey,
              learnedPoolSig,
              originalWords: [...block.words],
              originalIndexMap: new Map(block.words.map((word, index) => [word.id, index])),
              anchors: [] as GameAnchor[],
            };
        let appended = false;
        for (const word of block.words) {
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
        planCache.set(cacheKey, plan);
        const maxOriginalIndex = Math.max(
          0,
          ...block.words.map((word) => plan.originalIndexMap.get(word.id) ?? 0),
        );
        const anchors = plan.anchors.filter((anchor) => anchor.anchorOriginalIndex <= maxOriginalIndex);
        const visibleAnchors = dismissedGames.size > 0
          ? anchors.filter((anchor) => !dismissedGames.has(anchor.id))
          : anchors;
        items = composeStream(
          block.words,
          plan.originalIndexMap,
          pruneAnchorsForCurrentSize(visibleAnchors, block.words.length, min),
        );
        items = enforceMinigameMinGap(items, min);
        items = dropTrailingGames(items);
      }
      if (dismissedGames.size > 0) items = items.filter((item) => !('_isMinigame' in item) || !dismissedGames.has(item.id));
      return {
        key: block.key,
        kind: block.kind,
        blockIndex: block.blockIndex,
        ...(block.reinforcement ? { reinforcement: true as const } : {}),
        items,
      };
    }).filter((group) => group.items.length > 0);
  }, [
    blocks,
    dismissedGames,
    excludeGameTypesKey,
    fineTuneConfig,
    fineTuneKey,
    getStageIndex,
    includeGameTypesKey,
    isHydrated,
    learnedPool,
    minigameFrequency,
    planCache,
    planIdentity,
    progressPlanRevision,
    retainedBlockKeys,
    selectedCategoriesKey,
    settlingWords,
    showNotReady,
    stableExcludeGameTypes,
    stableIncludeGameTypes,
    wordsResetKey,
  ]);

  return {
    resetStablePlans() {
      planCache.reset();
    },
    streamGroups,
    /** @deprecated Consumers should use the keyed group structure. */
    streamGroupedWords: streamGroups.map((group) => group.items),
  };
}
