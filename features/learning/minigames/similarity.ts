import type { NormalizedWord } from '@/lib/words';

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

function isSimilarTerm(a: string, b: string): boolean {
  const aTrim = a.trim();
  const bTrim = b.trim();
  if (!aTrim || !bTrim) return false;
  if (aTrim.split(/\s+/).length !== 1 || bTrim.split(/\s+/).length !== 1) return false;

  const normA = normalizeForSimilarity(aTrim);
  const normB = normalizeForSimilarity(bTrim);
  if (normA.length < 3 || normB.length < 3) return false;
  if (normA === normB) return true;
  if (Math.abs(normA.length - normB.length) <= 2 && commonPrefixLength(normA, normB) >= 3) {
    return true;
  }
  return isOneEditAway(normA, normB);
}

function areWordsSimilarForLevel2(a: NormalizedWord, b: NormalizedWord): boolean {
  return isSimilarTerm(a.cz, b.cz) || isSimilarTerm(a.vi, b.vi);
}

export function buildSimilarPairs(pool: NormalizedWord[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      if (areWordsSimilarForLevel2(pool[i], pool[j])) {
        pairs.push([i, j]);
      }
    }
  }
  return pairs;
}

export function hasAtLeastOneSimilarPair(words: NormalizedWord[]): boolean {
  return buildSimilarPairs(words).length > 0;
}
