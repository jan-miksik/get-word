import { describe, expect, it } from 'vitest';
import { calculateProgressStats } from '../progress-stats';
import type { NormalizedWord } from '../words';

const words: NormalizedWord[] = [
  { id: 'w1', cz: 'a', en: 'a', vi: 'a', category: ['noun'] } as NormalizedWord,
  { id: 'w2', cz: 'b', en: 'b', vi: 'b', category: ['noun'] } as NormalizedWord,
  { id: 'w3', cz: 'c', en: 'c', vi: 'c', category: ['verb'] } as NormalizedWord,
];

describe('progress-stats', () => {
  it('computes totals and readyCount over the filtered set', () => {
    // The caller passes the already category-filtered set; the stats never
    // filter again.
    const filtered = words;
    const progress = {
      w1: { stageIndex: 1, knownCount: 1, unknownCount: 0, nextDueAt: Date.now() - 1000 },
      w2: { stageIndex: 1, knownCount: 1, unknownCount: 0, nextDueAt: Date.now() + 100_000 },
      w3: { stageIndex: 0, knownCount: 0, unknownCount: 0 },
    };

    const stats = calculateProgressStats(filtered, progress, 1);

    expect(stats.total).toBe(3);
    expect(stats.readyCount).toBe(1);
    expect(stats.new).toBe(1);
    expect(stats.fresh).toBe(2);
    expect(stats.totalKnown).toBe(2);
  });
});
