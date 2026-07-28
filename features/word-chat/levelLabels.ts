import type { I18nKey } from '@/lib/i18n/locales/en';
import type { WordChatLanguageLevel } from './types';

export function wordChatLevelLabelKey(level: WordChatLanguageLevel): I18nKey {
  return `wordChat.level${level}` as I18nKey;
}

/**
 * Split "A0 — I understand almost nothing" into its code and its description.
 *
 * Translations are expected to keep the `A0 — …` shape, but which dash a
 * translator reaches for is not something to rely on, so em dash, en dash and
 * hyphen all count. Anything unrecognised falls back to showing the label whole
 * rather than mangling it.
 */
export function splitWordChatLevelLabel(level: WordChatLanguageLevel, label: string) {
  const match = label.match(/^\s*([A-Z]\d)\s*[—–-]\s*(.+)$/);
  if (match && match[1] === level && match[2]) {
    return { code: level, description: match[2] };
  }
  return { code: level, description: label };
}
