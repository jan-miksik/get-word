import { STAGES } from '@/lib/words';
import type { ProgressData } from '@/features/sync/types';
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
  /**
   * Words retired as "fully known": the top stage with no due date, so the
   * ladder is finished rather than merely booked for another 60 days. Counted
   * inside `byStage[last]` too — a caller that shows both must subtract.
   */
  retired: number;
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
    retired: 0,
  };

  filteredWords.forEach((word) => {
    const prog: ProgressData = progress[word.id] || {
      stageIndex: 0,
      knownCount: 0,
      unknownCount: 0,
    };
    const stageIdx = Math.max(0, Math.min(prog.stageIndex || 0, STAGES.length - 1));
    
    stats.byStage[stageIdx] += 1;
    if (stageIdx === STAGES.length - 1 && !prog.nextDueAt) {
      stats.retired += 1;
    }
    stats.totalKnown += prog.knownCount || 0;
    stats.totalUnknown += prog.unknownCount || 0;
    
    if (stageIdx === 0) {
      stats.new += 1;
    } else if (stageIdx >= 1 && stageIdx <= 2) {
      stats.fresh += 1;
    } else if (stageIdx >= 3 && stageIdx <= 5) {
      stats.learning += 1;
    } else if (stageIdx >= 6) {
      stats.done += 1;
    }
  });

  return stats;
}
