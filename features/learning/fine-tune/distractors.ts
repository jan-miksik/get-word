import type { NormalizedWord } from '@/lib/words';
import {
  bandAtLeast,
  similarityBand,
  type SimilarityBand,
} from '@/features/learning/minigames/similarity';
import { hasDistinctVisibleAnswers, sharesLearningScope } from '@/features/learning/minigames/word-pool';

/**
 * Order in which a requested difficulty gives way when the list simply does not
 * contain enough confusable words. We drop the *similarity*, never the option
 * count: a six-option question built from mildly similar words is still a
 * six-option question, whereas silently shrinking it to four would change the
 * exercise the learner asked for.
 */
const BAND_DEGRADATION_ORDER: readonly SimilarityBand[] = ['III', 'II', 'I'];

/**
 * How many distractors must genuinely sit in the requested band before the
 * variant counts as having that difficulty. Demanding seven near-twins for an
 * eight-option question would be unsatisfiable in any real list; two are enough
 * to make the learner read carefully, and the rest add plausible noise.
 *
 * Tunable on purpose — worth revisiting once we can see how often real lists
 * degrade in practice.
 */
export const MIN_IN_BAND_OPTIONS = (optionCount: number): number =>
  Math.min(2, Math.max(0, optionCount - 1));

/** Same idea for matching, counted over the words that form the round. */
export const MIN_IN_BAND_PAIRS = (pairCount: number): number =>
  Math.min(2, Math.max(0, Math.floor(pairCount / 2)));

/**
 * Upper bound on how many candidates we score per card. Band III needs a wide
 * net — near-twins are rare — but the work must stay bounded on long lists, so
 * we scan a generous slice centred on the word's own position.
 */
const DISTRACTOR_SCAN_LIMIT = 400;

export interface ResolvedDistractors {
  distractors: NormalizedWord[];
  requestedBand: SimilarityBand;
  /** Lower than requested when the list ran out of similar-enough words. */
  effectiveBand: SimilarityBand;
}

interface ScoredCandidate {
  word: NormalizedWord;
  band: SimilarityBand;
  /** Words from the same lesson make better company than random ones. */
  inScope: boolean;
}

function scanSlice(pool: NormalizedWord[], targetId: string): NormalizedWord[] {
  if (pool.length <= DISTRACTOR_SCAN_LIMIT) return pool;
  const index = pool.findIndex((word) => word.id === targetId);
  const centre = index >= 0 ? index : 0;
  const half = Math.floor(DISTRACTOR_SCAN_LIMIT / 2);
  const start = Math.max(0, Math.min(pool.length - DISTRACTOR_SCAN_LIMIT, centre - half));
  return pool.slice(start, start + DISTRACTOR_SCAN_LIMIT);
}

function scoreCandidates(target: NormalizedWord, pool: NormalizedWord[]): ScoredCandidate[] {
  const seen = new Set<string>([target.id]);
  const scored: ScoredCandidate[] = [];

  for (const word of scanSlice(pool, target.id)) {
    if (seen.has(word.id)) continue;
    seen.add(word.id);
    if (!hasDistinctVisibleAnswers(target, word)) continue;
    scored.push({
      word,
      band: similarityBand(target, word),
      inScope: sharesLearningScope(target, word),
    });
  }

  return scored;
}

const BAND_RANK: Record<SimilarityBand, number> = { I: 0, II: 1, III: 2 };

function takeDeterministic<T>(items: T[], count: number, random: () => number): T[] {
  if (items.length <= count) return [...items];
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(Math.min(index, pool.length - 1), 1)[0]);
  }
  return picked;
}

/**
 * Build the distractor set for one exercise, stepping the difficulty down only
 * as far as the available vocabulary forces.
 *
 * Returns `null` only when the list does not hold `count` usable words at all —
 * band I accepts any other word, so failure means there is nothing to ask with,
 * not that the words were too dissimilar.
 */
export function resolveVariantDistractors({
  target,
  pool,
  count,
  band,
  minInBand,
  random,
}: {
  target: NormalizedWord;
  pool: NormalizedWord[];
  count: number;
  band: SimilarityBand;
  minInBand: (count: number) => number;
  random: () => number;
}): ResolvedDistractors | null {
  if (count <= 0) {
    return { distractors: [], requestedBand: band, effectiveBand: band };
  }

  const candidates = scoreCandidates(target, pool);
  if (candidates.length < count) return null;

  const required = minInBand(count + 1);
  const startAt = BAND_DEGRADATION_ORDER.indexOf(band);

  for (let step = startAt < 0 ? 0 : startAt; step < BAND_DEGRADATION_ORDER.length; step += 1) {
    const attempt = BAND_DEGRADATION_ORDER[step];
    const inBand = candidates.filter((candidate) => bandAtLeast(candidate.band, attempt));
    if (inBand.length < Math.min(required, count)) continue;

    const chosen = takeDeterministic(preferInScope(inBand), Math.min(count, inBand.length), random);
    const chosenIds = new Set(chosen.map((candidate) => candidate.word.id));

    // Fill the remaining slots with the next-best words available: they keep the
    // option count intact without pretending to be part of the harder band.
    const filler = candidates
      .filter((candidate) => !chosenIds.has(candidate.word.id))
      .sort((a, b) => {
        const byBand = BAND_RANK[b.band] - BAND_RANK[a.band];
        if (byBand !== 0) return byBand;
        return Number(b.inScope) - Number(a.inScope);
      });

    const distractors = [...chosen, ...filler.slice(0, count - chosen.length)];
    if (distractors.length < count) continue;

    return {
      distractors: distractors.map((candidate) => candidate.word),
      requestedBand: band,
      effectiveBand: attempt,
    };
  }

  return null;
}

function preferInScope(candidates: ScoredCandidate[]): ScoredCandidate[] {
  const inScope = candidates.filter((candidate) => candidate.inScope);
  return inScope.length > 0 ? inScope : candidates;
}

/**
 * Cheap feasibility probe used while filtering a stage's allowed variants —
 * same rules as `resolveVariantDistractors`, without building the set.
 */
export function canBuildVariant({
  target,
  pool,
  count,
}: {
  target: NormalizedWord;
  pool: NormalizedWord[];
  count: number;
}): boolean {
  if (count <= 0) return true;
  return scoreCandidates(target, pool).length >= count;
}
