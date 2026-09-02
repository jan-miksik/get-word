import { splitGraphemes } from '@/lib/answer-normalization';

/**
 * Letters that differ from each other by nothing but a diacritic.
 *
 * Each family is one base letter plus every accented form of it that Czech,
 * Ukrainian transliteration or Vietnamese puts on the page. Two members of the
 * same family are the pair a learner's eye slides over — which makes them both
 * the letters an assembly round should offer as decoys, and the single edit an
 * invented lookalike is built from.
 */
const LETTER_FAMILIES = [
  'aáàảãạăắằẳẵặâấầẩẫậ',
  'cč',
  'dďđ',
  'eéěèẻẽẹêếềểễệ',
  'iíìỉĩị',
  'nň',
  'oóòỏõọôốồổỗộơớờởỡợ',
  'rř',
  'sš',
  'tť',
  'uúůùủũụưứừửữự',
  'yýỳỷỹỵ',
  'zž',
] as const;

/**
 * Letters that are told apart by their shape rather than by an accent.
 *
 * These are the pairs an eye slides over in a script that carries few accents:
 * without them a list written in plain Latin letters has no way to reach the
 * hardest band at all, because every trap it can build is an accent it never
 * writes. Each entry is one confusable pair of base letters.
 */
const LOOKALIKE_PAIRS = ['oa', 'il', 'rt', 'mn', 'pb'] as const;

/** A letter stripped of its accent — the form the lookalike pairs are written in. */
export function baseLetterOf(letter: string): string {
  const normalized = letter.toLocaleLowerCase();
  const family = letterFamilyOf(normalized);
  return family ? family.slice(0, 1) : normalized;
}

/** The family a lowercase letter belongs to, or `null` for letters with no accented forms. */
export function letterFamilyOf(letter: string): string | null {
  const normalized = letter.toLocaleLowerCase();
  return LETTER_FAMILIES.find((family) => family.includes(normalized)) ?? null;
}

export function confusableLetters(correct: string[]): string[] {
  const correctSet = new Set(correct.map((part) => part.toLocaleLowerCase()));
  const output: string[] = [];
  for (const part of correctSet) {
    const family = letterFamilyOf(part);
    if (!family) continue;
    for (const candidate of splitGraphemes(family)) {
      if (!correctSet.has(candidate)) output.push(candidate);
    }
  }
  return output;
}

export function lettersAreConfusable(left: string, right: string): boolean {
  const normalizedLeft = left.toLocaleLowerCase();
  const normalizedRight = right.toLocaleLowerCase();
  if (normalizedLeft === normalizedRight) return true;
  return LETTER_FAMILIES.some(
    (family) => family.includes(normalizedLeft) && family.includes(normalizedRight),
  );
}

/** Letters confusable with `letter` by shape alone, ignoring any accent it carries. */
export function lookalikeLettersOf(letter: string): string[] {
  const base = baseLetterOf(letter);
  const output: string[] = [];
  for (const pair of LOOKALIKE_PAIRS) {
    if (!pair.includes(base)) continue;
    for (const candidate of pair) {
      if (candidate !== base) output.push(candidate);
    }
  }
  return output;
}

/**
 * Shape decoys for a set of answer letters, in the same spirit as
 * `confusableLetters` — what band II offers, and what band III falls back to in
 * a script that does not accent the letters in play.
 */
export function lookalikeLetters(correct: string[]): string[] {
  const correctSet = new Set(correct.map((part) => part.toLocaleLowerCase()));
  const output: string[] = [];
  for (const part of correctSet) {
    for (const candidate of lookalikeLettersOf(part)) {
      if (!correctSet.has(candidate)) output.push(candidate);
    }
  }
  return output;
}

/** True for two different letters that differ only in shape, such as `m` and `n`. */
export function lettersAreLookalike(left: string, right: string): boolean {
  const baseLeft = baseLetterOf(left);
  const baseRight = baseLetterOf(right);
  if (baseLeft === baseRight) return false;
  return LOOKALIKE_PAIRS.some((pair) => pair.includes(baseLeft) && pair.includes(baseRight));
}

/** True when the alphabet in use writes an accented form of `letter`. */
export function scriptAccentsLetter(letter: string, alphabet: ReadonlySet<string>): boolean {
  const family = letterFamilyOf(letter);
  if (!family) return false;
  const base = family.slice(0, 1);
  return splitGraphemes(family).some(
    (member) => member !== base && alphabet.has(member),
  );
}
