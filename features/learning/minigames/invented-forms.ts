import { splitGraphemes } from '@/lib/answer-normalization';
import { letterFamilyOf } from './letter-families';

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
 * A diacritic change is preferred because it is the most natural spelling trap.
 * When the word has no usable diacritic family, one letter is substituted with
 * another letter already present in the learner's list. That lets an unaccented
 * word such as "house" support band III too, without importing characters from
 * a different writing system. Multi-word phrases remain excluded: they are told
 * apart by their shape long before a single bent letter becomes meaningful.
 */
export function inventLookalikeForms({
  term,
  alphabet,
  isTaken,
  limit,
  random,
}: {
  term: string;
  /** Letters available in the language being read; see `scriptAlphabet`. */
  alphabet: ReadonlySet<string>;
  /** True for any surface the learner could rightly claim as an answer. */
  isTaken: (candidate: string) => boolean;
  limit: number;
  random: () => number;
}): string[] {
  const trimmed = term.trim().normalize('NFC');
  if (limit <= 0 || !trimmed || /\s/u.test(trimmed)) return [];

  const graphemes = splitGraphemes(trimmed);
  if (graphemes.length < MIN_INVENTABLE_GRAPHEMES) return [];

  const own = surfaceKey(trimmed);
  const seen = new Set<string>([own]);
  const candidates: string[] = [];

  for (let index = 0; index < graphemes.length; index += 1) {
    const family = letterFamilyOf(graphemes[index]);
    if (!family) continue;
    const current = graphemes[index].toLocaleLowerCase();
    // The unaccented base is always in play: it belongs to any Latin alphabet,
    // and dropping an accent is the mistake learners actually make.
    const base = family.slice(0, 1);

    for (const member of splitGraphemes(family)) {
      if (member === current) continue;
      if (member !== base && !alphabet.has(member)) continue;

      const bent = [...graphemes];
      bent[index] = withCaseOf(graphemes[index], member);
      const candidate = bent.join('');
      const key = surfaceKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      if (isTaken(candidate)) continue;
      candidates.push(candidate);
    }
  }

  // Plain words have no diacritic variant to draw from. Bend one grapheme with
  // a letter or number the same list already uses; the result is still exactly
  // one edit away and therefore an honest near-twin, even when it is not a real
  // dictionary word.
  const scriptCharacters = [...alphabet]
    .filter((candidate) => /^[\p{L}\p{N}]$/u.test(candidate))
    .map((candidate) => candidate.toLocaleLowerCase());
  for (let index = 0; index < graphemes.length; index += 1) {
    const current = graphemes[index].toLocaleLowerCase();
    for (const replacement of scriptCharacters) {
      if (replacement === current) continue;
      const bent = [...graphemes];
      bent[index] = withCaseOf(graphemes[index], replacement);
      const candidate = bent.join('');
      const key = surfaceKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      if (isTaken(candidate)) continue;
      candidates.push(candidate);
    }
  }

  // A tiny or single-character alphabet can make substitution impossible.
  // Deletion is the final one-edit fallback, while still leaving a visible
  // option and respecting the same taken-answer guard.
  if (graphemes.length > 2) {
    for (let index = 0; index < graphemes.length; index += 1) {
      const candidate = graphemes.filter((_, partIndex) => partIndex !== index).join('');
      const key = surfaceKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      if (isTaken(candidate)) continue;
      candidates.push(candidate);
    }
  }

  const picked: string[] = [];
  while (picked.length < limit && candidates.length > 0) {
    const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    picked.push(candidates.splice(index, 1)[0]);
  }
  return picked;
}
