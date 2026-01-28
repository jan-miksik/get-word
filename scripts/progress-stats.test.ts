import assert from 'node:assert/strict';
import { calculateProgressStats, getProgressStatsWords } from '../lib/progress-stats';
import type { NormalizedWord } from '../lib/words';

const words: NormalizedWord[] = [
  { id: 'w1', cz: 'a', en: 'a', vi: 'a', category: ['noun'] } as NormalizedWord,
  { id: 'w2', cz: 'b', en: 'b', vi: 'b', category: ['noun'] } as NormalizedWord,
  { id: 'w3', cz: 'c', en: 'c', vi: 'c', category: ['verb'] } as NormalizedWord,
];

const selectedCategories = new Set<string>();
const statsWords = getProgressStatsWords(words, selectedCategories);
const now = Date.now();
const progress = {
  w1: { stageIndex: 1, knownCount: 1, unknownCount: 0, nextDueAt: now - 1000 },
  w2: { stageIndex: 1, knownCount: 1, unknownCount: 0, nextDueAt: now + 100000 },
  w3: { stageIndex: 0, knownCount: 0, unknownCount: 0 },
};

const readyCount = 1;
const stats = calculateProgressStats(statsWords, progress, readyCount);

assert.equal(stats.total, 3);
assert.equal(stats.readyCount, 1);
