import type { NormalizedWord } from '@/lib/words';
import type { I18nKey } from '@/lib/i18n/messages';
import { getLocalizedLanguageName } from '@/lib/i18n/languages';
import { getWordLanguageCodeForSide, type WordSide } from './types';

type Translate = (key: I18nKey, values?: Record<string, string | number>) => string;

/**
 * Human label for the language of a learning word's given side, used in typing prompts
 * ("Type in {language}"). Prefers the locative `languageNameIn.*` form, then
 * the nominative catalog entry, then Intl.DisplayNames, then the raw code.
 */
export function getTypingTargetLanguageLabel(
  word: NormalizedWord,
  side: WordSide,
  t: Translate,
  language: string,
): string {
  const code = getWordLanguageCodeForSide(word, side);
  if (code) {
    const inKey = `languageNameIn.${code}` as I18nKey;
    const inTranslated = t(inKey);
    if (inTranslated && inTranslated !== inKey) return inTranslated;
  }
  // BCP-47-driven lookup; falls back to the legacy cz/vi labels for words
  // that pre-date the languageFrom/languageTo metadata.
  if (code) {
    // Dynamic BCP-47 code; the key may or may not exist in the message
    // catalog. t() returns the key itself when missing, which we treat as
    // "fall back to Intl.DisplayNames below".
    const key = `languageName.${code}` as I18nKey;
    const translated = t(key);
    if (translated && translated !== key) return translated;

    const localizedName = getLocalizedLanguageName(code, language);
    if (localizedName) return localizedName;

    return code.toUpperCase();
  }
  // Only words without language metadata can be legacy Czech/Vietnamese
  // records. Never use these labels for a known, different language pair.
  return side === 'from' ? t('languageNameIn.cs') : t('languageNameIn.vi');
}
