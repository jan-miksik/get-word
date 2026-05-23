/**
 * Pair-agnostic learning-side axis.
 *
 * The app used to model the user's role as `'cz' | 'vi'` — strings that
 * doubled as both a positional selector ("the from-side of a WordList" vs
 * "the to-side") and a legacy app-specific language code (Czech was 'cz',
 * Vietnamese was 'vi'). That conflation prevented the rest of the language-
 * pair-agnostic code (`WordList.languageFrom` / `languageTo` are BCP-47) from
 * ever reaching the games and a slice of role storage.
 *
 * This module replaces those literals with two clean axes:
 *
 * - `WordSide` — which physical side of a word ('from' / 'to'). Independent
 *   of any user. Used to read text/audio off a NormalizedWord and to iterate
 *   over both sides for audio selection.
 *
 * - `LearningRole` — which side of the active WordList the user already
 *   knows. The value names what the WordList's *from* side represents:
 *     'knownLanguage'   → from-side IS the user's known language  (= old 'cz')
 *     'languageToLearn' → from-side IS what they're learning      (= old 'vi')
 */

export type WordSide = 'from' | 'to';

export type LearningRole = 'knownLanguage' | 'languageToLearn';

/** The side the user already knows for a given role. */
export function knownSideForRole(role: LearningRole): WordSide {
  return role === 'knownLanguage' ? 'from' : 'to';
}

/** The side the user is learning for a given role. */
export function learningSideForRole(role: LearningRole): WordSide {
  return role === 'knownLanguage' ? 'to' : 'from';
}

/** The other side. */
export function flipSide(side: WordSide): WordSide {
  return side === 'from' ? 'to' : 'from';
}

/** Type-narrowing predicate for unknown values (e.g. parsed JSON, server payloads). */
export function isLearningRole(value: unknown): value is LearningRole {
  return value === 'knownLanguage' || value === 'languageToLearn';
}
