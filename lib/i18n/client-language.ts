'use client';

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_SETTINGS_LANGUAGE,
  getDetectedSettingsLanguage,
  normalizeLanguageCode,
} from '@/lib/i18n/languages';
import { PUBLIC_LANGUAGE_STORAGE_KEY } from '@/lib/i18n/public-language';

export function readPreferredPublicLanguage(): string {
  try {
    const saved = localStorage.getItem(PUBLIC_LANGUAGE_STORAGE_KEY);
    if (saved) return normalizeLanguageCode(saved);
  } catch {
    // Storage can be unavailable in private browsing; browser detection is enough.
  }
  return getDetectedSettingsLanguage();
}

export function usePreferredPublicLanguage(): string {
  return useSyncExternalStore(
    () => () => {},
    readPreferredPublicLanguage,
    () => DEFAULT_SETTINGS_LANGUAGE,
  );
}
