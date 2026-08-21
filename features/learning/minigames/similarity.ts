import { similarityRatio } from '@/lib/levenshtein';
import type { NormalizedWord } from '@/lib/words';

/**
 * How confusable two words are, from the learner's point of view.
 *
 *   I   'different' — nothing much in common
 *   II  'similar'   — shares a good half of its letters
 *   III 'extreme'   — near twins ("fér" / "fén"), the hardest distractors
 *
 * The band drives distractor selection: a quiz asking for band III wants
 * options the learner can only tell apart by reading carefully.
 */
export type SimilarityBand = 'I' | 'II' | 'III';

export const SIMILARITY_BANDS = ['I', 'II', 'III'] as const;

/** Ascending difficulty, so a higher rank also satisfies a lower requirement. */
const BAND_RANK: Record<SimilarityBand, number> = { I: 0, II: 1, III: 2 };

export function bandAtLeast(band: SimilarityBand, required: SimilarityBand): boolean {
  return BAND_RANK[band] >= BAND_RANK[required];
}

const EXTREME_RATIO = 0.9;
const SIMILAR_RATIO = 0.5;

function normalizeForSimilarity(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function isOneEditAway(a: string, b: string): boolean {
  if (a === b) return true;
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < lenA && j < lenB) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) return false;
    if (lenA > lenB) i += 1;
    else if (lenB > lenA) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }

  if (i < lenA || j < lenB) edits += 1;
  return edits <= 1;
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Band for two raw terms. Multi-word phrases and very short fragments never
 * reach II or III — "a" vs "b" is a one-edit pair on paper but nobody confuses
 * them, and phrase pairs are told apart by their shape long before their spelling.
 */
export function similarityBandForTerms(a: string, b: string): SimilarityBand {
  const aTrim = a.trim();
  const bTrim = b.trim();
  if (!aTrim || !bTrim) return 'I';
  if (aTrim.split(/\s+/).length !== 1 || bTrim.split(/\s+/).length !== 1) return 'I';

  const normA = normalizeForSimilarity(aTrim);
  const normB = normalizeForSimilarity(bTrim);
  if (normA.length < 3 || normB.length < 3) return 'I';
  if (normA === normB) return 'III';

  const ratio = similarityRatio(normA, normB);

  // A single differing letter is the classic trap regardless of word length:
  // "fér"/"fén" only scores 0.67 by ratio, yet it is exactly the pair a learner
  // misreads. Short words would otherwise never reach band III at all.
  if (ratio >= EXTREME_RATIO || isOneEditAway(normA, normB)) return 'III';

  if (
    ratio >= SIMILAR_RATIO ||
    (Math.abs(normA.length - normB.length) <= 2 && commonPrefixLength(normA, normB) >= 3)
  ) {
    return 'II';
  }

  return 'I';
}

/**
 * Band for two words, taking the more confusable of the two sides. A pair that
 * looks alike on either side is a valid hard distractor whichever direction the
 * exercise ends up asking.
 */
export function similarityBand(a: NormalizedWord, b: NormalizedWord): SimilarityBand {
  const known = similarityBandForTerms(a.cz, b.cz);
  const target = similarityBandForTerms(a.vi, b.vi);
  return BAND_RANK[known] >= BAND_RANK[target] ? known : target;
}

function areWordsSimilar(a: NormalizedWord, b: NormalizedWord): boolean {
  return bandAtLeast(similarityBand(a, b), 'II');
}

export function buildSimilarPairs(pool: NormalizedWord[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      if (areWordsSimilar(pool[i], pool[j])) {
        pairs.push([i, j]);
      }
    }
  }
  return pairs;
}

export function hasAtLeastOneSimilarPair(words: NormalizedWord[]): boolean {
  return buildSimilarPairs(words).length > 0;
}
