/**
 * Plural selection for interpolated counts.
 *
 * Three forms, on purpose: `one` (1 word), `few` (the Slavic paucal, 2–4
 * words), and `many` (everything else, which is also the only plural most
 * languages have). The message dictionaries are flat key → string maps and
 * several of them are machine-generated, so a language can only ever be offered
 * a fixed, small set of slots — full CLDR categories would mean a different
 * message format and a different translation pipeline.
 *
 * Languages without a rule of their own fall back to one/many. That is correct
 * for English and harmless for languages that do not inflect for number at all,
 * because their two forms are written identically in the dictionary.
 */
export type PluralCategory = 'one' | 'few' | 'many';

/** Languages where the last digit decides, except inside the teens. */
const DECADE_RULE_LANGUAGES = new Set(['uk', 'ru', 'be', 'hr', 'sr', 'bs', 'pl']);
/** Languages where only a bare 1 is singular and 2–4 form the paucal. */
const PAUCAL_RULE_LANGUAGES = new Set(['cs', 'sk']);

export function getPluralCategory(language: string, count: number): PluralCategory {
  const n = Math.abs(Math.trunc(count));
  const base = language.toLowerCase().split(/[-_]/)[0];

  if (PAUCAL_RULE_LANGUAGES.has(base)) {
    if (n === 1) return 'one';
    return n >= 2 && n <= 4 ? 'few' : 'many';
  }

  if (DECADE_RULE_LANGUAGES.has(base)) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    // Polish keeps 21, 31, … plural; the other languages in this set make them
    // singular again.
    const singular = base === 'pl' ? n === 1 : mod10 === 1 && mod100 !== 11;
    if (singular) return 'one';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
    return 'many';
  }

  return n === 1 ? 'one' : 'many';
}

/**
 * Picks the message key for `count` out of the three forms a caller declares.
 * Callers pass a literal record so the keys stay type-checked against the
 * dictionary instead of being assembled from strings.
 */
export function pluralForm<T>(
  forms: Record<PluralCategory, T>,
  language: string,
  count: number
): T {
  return forms[getPluralCategory(language, count)];
}
