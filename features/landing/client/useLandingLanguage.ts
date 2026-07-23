'use client';

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_SETTINGS_LANGUAGE,
  getDetectedSettingsLanguage,
  normalizeLanguageCode,
} from '@/lib/i18n/languages';
import {
  PUBLIC_LANGUAGE_STORAGE_KEY,
  writePreferredPublicLanguage,
} from '@/lib/i18n/public-language';

function readPreferredLanguage(): string {
  try {
    const saved = localStorage.getItem(PUBLIC_LANGUAGE_STORAGE_KEY);
    if (saved) return normalizeLanguageCode(saved);
  } catch {
    // localStorage may be unavailable (private mode) — fall through.
  }
  return getDetectedSettingsLanguage();
}

let currentLanguage: string | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): string {
  if (currentLanguage === null) currentLanguage = readPreferredLanguage();
  return currentLanguage;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function setLanguage(next: string): void {
  const normalized = normalizeLanguageCode(next);
  currentLanguage = normalized;
  writePreferredPublicLanguage(normalized);
  listeners.forEach((listener) => listener());
}

export function useLandingLanguage(): readonly [string, (next: string) => void] {
  const language = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_SETTINGS_LANGUAGE);
  return [language, setLanguage] as const;
}
