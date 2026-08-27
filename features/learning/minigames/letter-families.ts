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
