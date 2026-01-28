import { STAGES, matchesCategoryFilter } from '@/lib/words';
import type { ProgressData } from '@/lib/sync';
import type { NormalizedWord } from '@/lib/words';

export interface ProgressStats {
  total: number;
  byStage: number[];
  totalKnown: number;
  totalUnknown: number;
  readyCount: number;
  fresh: number;
  learning: number;
  done: number;
  new: number;
}

export function getProgressStatsWords(
  allWords: NormalizedWord[],
  selectedCategories: Set<string>
): NormalizedWord[] {
  return allWords.filter((word) => matchesCategoryFilter(word, selectedCategories));
}

export function calculateProgressStats(
  filteredWords: NormalizedWord[],
  progress: Record<string, ProgressData>,
  readyCount: number
): ProgressStats {
  const stats: ProgressStats = {
    total: filteredWords.length,
    byStage: STAGES.map(() => 0),
    totalKnown: 0,
    totalUnknown: 0,
    readyCount: readyCount,
    fresh: 0,
    learning: 0,
    done: 0,
    new: 0,
  };

  filteredWords.forEach((word) => {
    const prog = progress[word.id] || {
      stageIndex: 0,
      knownCount: 0,
      unknownCount: 0,
    };
    const stageIdx = Math.max(0, Math.min(prog.stageIndex || 0, STAGES.length - 1));
    
    stats.byStage[stageIdx] += 1;
    stats.totalKnown += prog.knownCount || 0;
    stats.totalUnknown += prog.unknownCount || 0;
    
    if (stageIdx === 0) {
      stats.new += 1;
    } else if (stageIdx >= 1 && stageIdx <= 5) {
      stats.fresh += 1;
    } else if (stageIdx >= 6 && stageIdx <= 8) {
      stats.learning += 1;
    } else if (stageIdx >= 9) {
      stats.done += 1;
    }
  });

  return stats;
}
