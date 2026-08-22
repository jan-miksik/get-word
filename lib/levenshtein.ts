/**
 * Levenshtein edit distance over UTF-16 code units.
 *
 * Shared by answer matching (picking the nearest accepted answer to show after
 * a wrong attempt) and by minigame distractor selection (scoring how confusable
 * two words are). Keep it in one place — two implementations would inevitably
 * drift and quietly change quiz difficulty.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  const curr = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

/**
 * Normalized similarity in [0, 1]: 1 = identical, 0 = nothing in common.
 */
export function similarityRatio(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * Levenshtein over tokens with a caller-supplied substitution cost.
 *
 * Answer grading needs a distance that asks *which letters were written*, not
 * how they were decorated: swapping `a` for `ă` costs nothing, swapping `u` for
 * `y` costs a full edit. Insertions and deletions always cost one — a missing
 * or extra character is a different word, never a decoration.
 */
export function levenshteinTokensWithCost(
  a: readonly string[],
  b: readonly string[],
  substitutionCost: (a: string, b: string) => number,
): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        previous[column - 1] + substitutionCost(a[row - 1], b[column - 1]),
        previous[column] + 1,
        current[column - 1] + 1,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
