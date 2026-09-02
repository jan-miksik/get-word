import { splitGraphemes } from '@/lib/answer-normalization';
import { baseLetterOf, letterFamilyOf, lookalikeLettersOf } from './letter-families';
import type { SimilarityBand } from './similarity';

/**
 * Invented lookalikes: distractors built by bending the correct answer itself
 * rather than by borrowing another word from the list.
 *
 * They exist because band III is otherwise unsatisfiable. A near-twin of the
 * word being asked ("fér" / "fén") is rare in any real list, so a request for
 * the hardest similarity quietly degrades to band II and the exercise stops
 * being hard. A one-edit variant of the answer is a guaranteed near-twin: a
 * diacritic change where possible, otherwise a same-list grapheme substitution.
 *
 * The exercise never claims these forms do not exist — a wrong pick is answered
 * with the plain "✗ <correct answer>" every wrong pick gets. That matters: a
 * diacritic swap in Vietnamese frequently lands on a real word, and an app that
 * announced "this word does not exist" would be lying about a language it
 * cannot check. Saying only "not this one, this one" is true either way, and
 * leaves an accidental real word behaving as an ordinary distractor.
 *
 * The one thing that must never happen is presenting an answer the learner
 * could defend as correct, which is what `isTaken` is for.
 */

/** Written identity of a term — what a learner would have to reproduce exactly. */
export function surfaceKey(value: string): string {
  return value.trim().toLocaleLowerCase().normalize('NFC');
}

/**
 * Two letters is the floor, not three.
 *
 * Three would have been the tidier rule — at two letters an accent is half the
 * word rather than a detail of it. But Vietnamese study lists are full of
 * two-letter entries ("cá", "mẹ", "bà"), and a tone mark on a short syllable is
 * the single thing about them a learner most needs to get right. Excluding them
 * would have left the commonest words in the language stuck below band III.
 */
const MIN_INVENTABLE_GRAPHEMES = 2;

/**
 * Every letter the learner's own list actually uses on one side.
 *
 * This is what keeps a Czech list from being offered "kốlo". The letter families
 * span every accent Czech and Vietnamese put on a vowel, and drawing from all of
 * them regardless of language produces shapes that read as a rendering fault, not
 * as a word someone might have written. Restricting replacements to graphemes
 * the list already contains keeps every invented form inside the writing system
 * the learner is reading.
 */
export function scriptAlphabet(terms: Iterable<string>): Set<string> {
  const alphabet = new Set<string>();
  for (const term of terms) {
    for (const grapheme of splitGraphemes(term.toLocaleLowerCase())) {
      alphabet.add(grapheme);
    }
  }
  return alphabet;
}

function withCaseOf(source: string, replacement: string): string {
  const upper = source.toLocaleUpperCase();
  const isUpper = source === upper && upper !== source.toLocaleLowerCase();
  return isUpper ? replacement.toLocaleUpperCase() : replacement;
}

/**
 * Build lookalikes of `term` that differ by one small written edit.
 *
 * Which edit depends on the band the exercise asked for, because the two hard
 * bands are hard in different ways:
 *
 *   II  a *different letter* — "tôi" against "tol", "vôi", "tâi". The word is
 *       recognisably the same shape, but a letter has been swapped for another.
 *   III an *accent* — "tôi" against "toi", "tồi", "tọi". Nothing but the mark
 *       above the vowel separates them, which is the finest distinction the
 *       writing system offers.
 *
 * A script that writes no accents cannot supply band III that way, so III then
 * falls back to the letters that are confusable by shape (o/a, i/l, r/t, m/n,
 * p/b) — still the smallest visible difference that language allows.
 *
 * Every candidate is exactly one edit from the answer either way, which is why
 * both bands are satisfied by whatever comes back. Multi-word phrases remain
 * excluded: they are told apart by their shape long before a single bent letter
 * becomes meaningful.
 */
export function inventLookalikeForms({
  term,
  alphabet,
  isTaken,
  limit,
  random,
  band = 'III',
}: {
  term: string;
  /** Letters available in the language being read; see `scriptAlphabet`. */
  alphabet: ReadonlySet<string>;
  /** True for any surface the learner could rightly claim as an answer. */
  isTaken: (candidate: string) => boolean;
  limit: number;
  random: () => number;
  /** The kind of edit to reach for first; see the doc comment above. */
  band?: SimilarityBand;
}): string[] {
  const trimmed = term.trim().normalize('NFC');
  if (limit <= 0 || !trimmed || /\s/u.test(trimmed)) return [];

  const graphemes = splitGraphemes(trimmed);
  if (graphemes.length < MIN_INVENTABLE_GRAPHEMES) return [];

  const seen = new Set<string>([surfaceKey(trimmed)]);

  /** One substitution, kept only if it is new, spellable and not a real answer. */
  const substitute = (index: number, replacement: string): string | null => {
    const bent = [...graphemes];
    bent[index] = withCaseOf(graphemes[index], replacement);
    const candidate = bent.join('');
    const key = surfaceKey(candidate);
    if (seen.has(key)) return null;
    seen.add(key);
    if (isTaken(candidate)) return null;
    return candidate;
  };

  const scriptCharacters = [...alphabet]
    .filter((candidate) => /^[\p{L}\p{N}]$/u.test(candidate))
    .map((candidate) => candidate.toLocaleLowerCase());

  // Same letter, different accent. The unaccented base is always in play: it
  // belongs to any Latin alphabet, and dropping an accent is the mistake
  // learners actually make. Other members must be ones the list already writes,
  // so a Czech round is never offered "kốlo".
  const accentEdits = (): string[] => {
    const output: string[] = [];
    for (let index = 0; index < graphemes.length; index += 1) {
      const family = letterFamilyOf(graphemes[index]);
      if (!family) continue;
      const current = graphemes[index].toLocaleLowerCase();
      const base = family.slice(0, 1);
      for (const member of splitGraphemes(family)) {
        if (member === current) continue;
        if (member !== base && !alphabet.has(member)) continue;
        const candidate = substitute(index, member);
        if (candidate) output.push(candidate);
      }
    }
    return output;
  };

  // A different letter of confusable shape. The partners are plain Latin
  // letters, so unlike accents they are safe to offer whatever the list writes;
  // an accented form of the partner is used as well when the list has one.
  const lookalikeEdits = (): string[] => {
    const output: string[] = [];
    for (let index = 0; index < graphemes.length; index += 1) {
      for (const partner of lookalikeLettersOf(graphemes[index])) {
        const accented = scriptCharacters.filter(
          (letter) => letter !== partner && baseLetterOf(letter) === partner,
        );
        for (const replacement of [partner, ...accented]) {
          const candidate = substitute(index, replacement);
          if (candidate) output.push(candidate);
        }
      }
    }
    return output;
  };

  // Any other letter the same list uses — the plain letter swap band II is
  // built on. Same-letter accent changes are excluded: those are band III's
  // edit, and mixing them in would make the two bands indistinguishable.
  //
  // `matches` is what keeps the result pronounceable. Swapping a vowel for a
  // consonant produces "tni" out of "tôi": a shape no language would write, and
  // one a learner rejects without reading it. Trading like for like — and
  // keeping the accent the letter already wore, so "tôi" yields "tâi" — leaves a
  // word that could plausibly exist, which is what makes the option worth
  // reading. Real words come out of it often enough on their own ("tôi" gives
  // "môi", "sôi", "hôi"); the list's own vocabulary is preferred over any of
  // this in the first place.
  const letterEdits = (matches: (replacement: string, current: string) => boolean) => (): string[] => {
    const output: string[] = [];
    for (let index = 0; index < graphemes.length; index += 1) {
      const current = graphemes[index].toLocaleLowerCase();
      for (const replacement of scriptCharacters) {
        if (baseLetterOf(replacement) === baseLetterOf(current)) continue;
        if (!matches(replacement, current)) continue;
        const candidate = substitute(index, replacement);
        if (candidate) output.push(candidate);
      }
    }
    return output;
  };

  const isVowel = (letter: string): boolean => 'aeiouy'.includes(baseLetterOf(letter));
  const isAccented = (letter: string): boolean => letter !== baseLetterOf(letter);
  const sameSound = (replacement: string, current: string): boolean =>
    isVowel(replacement) === isVowel(current);
  const sameSoundAndAccent = (replacement: string, current: string): boolean =>
    sameSound(replacement, current) && isAccented(replacement) === isAccented(current);

  // A tiny or single-character alphabet can make substitution impossible.
  // Deletion is the final one-edit fallback, while still leaving a visible
  // option and respecting the same taken-answer guard.
  const deletions = (): string[] => {
    if (graphemes.length <= 2) return [];
    const output: string[] = [];
    for (let index = 0; index < graphemes.length; index += 1) {
      const candidate = graphemes.filter((_, partIndex) => partIndex !== index).join('');
      const key = surfaceKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      if (isTaken(candidate)) continue;
      output.push(candidate);
    }
    return output;
  };

  // Tiers, not one flat pool: the preferred edit has to be exhausted before the
  // next one is touched. Drawing from a single list would bury the handful of
  // accent variants under the hundreds of possible letter swaps, and a band III
  // round would almost never show the accent trap it exists for.
  const tiers =
    band === 'II'
      ? [
          letterEdits(sameSoundAndAccent),
          letterEdits(sameSound),
          letterEdits(() => true),
          accentEdits,
          deletions,
        ]
      : [accentEdits, lookalikeEdits, letterEdits(sameSound), letterEdits(() => true), deletions];

  const picked: string[] = [];
  for (const tier of tiers) {
    if (picked.length >= limit) break;
    const candidates = tier();
    while (picked.length < limit && candidates.length > 0) {
      const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
      picked.push(candidates.splice(index, 1)[0]);
    }
  }
  return picked;
}
