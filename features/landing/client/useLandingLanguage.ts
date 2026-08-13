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
import {
  PUBLIC_LANGUAGE_STORAGE_KEY,
  writePreferredPublicLanguage,
} from '@/lib/i18n/public-language';

const BUNDLED_UI_LANGUAGE_CODE_SET = new Set(
  BUNDLED_UI_LANGUAGE_CODES.map(normalizeLanguageCode),
);
const BUNDLED_UI_LANGUAGES = mergeLanguages(COMMON_LANGUAGES, GOOGLE_TRANSLATE_LANGUAGES)
  .filter((item) => BUNDLED_UI_LANGUAGE_CODE_SET.has(normalizeLanguageCode(item.code)));

function bundledOrDefault(value: unknown): string {
  const normalized = normalizeLanguageCode(value);
  return BUNDLED_UI_LANGUAGE_CODE_SET.has(normalized)
    ? normalized
    : DEFAULT_SETTINGS_LANGUAGE;
}

function readPreferredLanguage(): string {
  try {
    const saved = localStorage.getItem(PUBLIC_LANGUAGE_STORAGE_KEY);
    if (saved) return bundledOrDefault(saved);
  } catch {
    // localStorage may be unavailable (private mode) — fall through.
  }
  return getDetectedSettingsLanguage(BUNDLED_UI_LANGUAGES);
}

let currentLanguage: string | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): string {
  if (currentLanguage === null) currentLanguage = readPreferredLanguage();
  return currentLanguage;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) currentLanguage = null;
  };
}

function setLanguage(next: string): void {
  const normalized = bundledOrDefault(next);
  currentLanguage = normalized;
  writePreferredPublicLanguage(normalized);
  listeners.forEach((listener) => listener());
}

export function useLandingLanguage(): readonly [string, (next: string) => void] {
  const language = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_SETTINGS_LANGUAGE);
  return [language, setLanguage] as const;
}
