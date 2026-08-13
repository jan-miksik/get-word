'use client';

import { useSyncExternalStore } from 'react';
import {
  COMMON_LANGUAGES,
  DEFAULT_SETTINGS_LANGUAGE,
  GOOGLE_TRANSLATE_LANGUAGES,
  getDetectedSettingsLanguage,
  mergeLanguages,
  normalizeLanguageCode,
} from '@/lib/i18n/languages';
import { BUNDLED_UI_LANGUAGE_CODES } from '@/lib/i18n/messages';
import { PUBLIC_LANGUAGE_STORAGE_KEY } from '@/lib/i18n/public-language';

const BUNDLED_UI_LANGUAGE_CODE_SET = new Set(
  BUNDLED_UI_LANGUAGE_CODES.map(normalizeLanguageCode),
);
const BUNDLED_UI_LANGUAGES = mergeLanguages(COMMON_LANGUAGES, GOOGLE_TRANSLATE_LANGUAGES)
  .filter((item) => BUNDLED_UI_LANGUAGE_CODE_SET.has(normalizeLanguageCode(item.code)));

export function readPreferredPublicLanguage(): string {
  try {
    const saved = localStorage.getItem(PUBLIC_LANGUAGE_STORAGE_KEY);
    if (saved) {
      const normalized = normalizeLanguageCode(saved);
      if (BUNDLED_UI_LANGUAGE_CODE_SET.has(normalized)) return normalized;
    }
  } catch {
    // Storage can be unavailable in private browsing; browser detection is enough.
  }
  return getDetectedSettingsLanguage(BUNDLED_UI_LANGUAGES);
}

export function usePreferredPublicLanguage(): string {
  return useSyncExternalStore(
    () => () => {},
    readPreferredPublicLanguage,
    () => DEFAULT_SETTINGS_LANGUAGE,
  );
}
