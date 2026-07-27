import { getBaseLanguage } from '@/lib/i18n/languages';

/**
 * Target languages where the polite/casual distinction visibly changes what a
 * learner should be taught, so it is worth mentioning once in the intro.
 * Everywhere else the question is noise and the neutral form is simply used.
 *
 * Shared by the client intro copy and the server chat prompt so the UI never
 * promises a question the model was told not to ask.
 *
 * Register is prompt context ONLY — never a persisted per-item field (that
 * column was deliberately dropped in migration 0033). It reaches the generation
 * prompt and `learner_brief.preferredRegister`, nothing else.
 */
const REGISTER_SENSITIVE_LANGUAGES = new Set([
  'cs', 'sk', 'pl', 'ru', 'uk', 'vi', 'de', 'fr', 'es', 'pt', 'it', 'nl',
  'ja', 'ko', 'th', 'id', 'hi', 'tr', 'el', 'ro', 'hu', 'fa',
]);

export function hasRegisterDistinction(languageCode: string): boolean {
  if (!languageCode) return false;
  return REGISTER_SENSITIVE_LANGUAGES.has(getBaseLanguage(languageCode));
}
