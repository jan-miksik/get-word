import {
  DEFAULT_OPENROUTER_TRANSLATION_MODEL,
  OPENROUTER_MODEL_STORAGE_KEY,
  normalizeOpenRouterModel,
} from '@/lib/openrouter-models';

export type StoredTranslationProvider = 'google' | 'openrouter';

const TRANSLATION_PROVIDER_STORAGE_KEY = 'get-word-list-translation-provider';
const GOOGLE_TTS_VOICE_STORAGE_PREFIX = 'get-word-list-google-tts-voice';
const ACTIVE_LIST_STORAGE_KEY = 'get-word-active-list';

function readStorageValue(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore private browsing or blocked storage; the current session still works.
  }
}

function removeStorageValue(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage persistence is best-effort; the current page state still works.
  }
}

export function readStoredTranslationProvider(): StoredTranslationProvider {
  return readStorageValue(TRANSLATION_PROVIDER_STORAGE_KEY) === 'openrouter'
    ? 'openrouter'
    : 'google';
}

export function writeStoredTranslationProvider(provider: StoredTranslationProvider): void {
  writeStorageValue(TRANSLATION_PROVIDER_STORAGE_KEY, provider);
}

export function readStoredSelectedListId(): string | null {
  return readStorageValue(ACTIVE_LIST_STORAGE_KEY);
}

export function writeStoredSelectedListId(listId: string | null): void {
  if (listId) {
    writeStorageValue(ACTIVE_LIST_STORAGE_KEY, listId);
    return;
  }
  removeStorageValue(ACTIVE_LIST_STORAGE_KEY);
}

export function readStoredOpenRouterModel(): string | null {
  const stored = readStorageValue(OPENROUTER_MODEL_STORAGE_KEY);
  return stored ? normalizeOpenRouterModel(stored) : null;
}

export function readStoredOpenRouterModelOrDefault(): string {
  return readStoredOpenRouterModel() ?? DEFAULT_OPENROUTER_TRANSLATION_MODEL;
}

export function writeStoredOpenRouterModel(model: string): void {
  writeStorageValue(OPENROUTER_MODEL_STORAGE_KEY, normalizeOpenRouterModel(model));
}

function getGoogleVoiceStorageKey(languageCode: string): string {
  return `${GOOGLE_TTS_VOICE_STORAGE_PREFIX}:${languageCode.toLowerCase()}`;
}

export function readStoredGoogleVoiceId(languageCode: string): string {
  return readStorageValue(getGoogleVoiceStorageKey(languageCode)) || 'default';
}

export function writeStoredGoogleVoiceId(languageCode: string, voiceId: string): void {
  writeStorageValue(getGoogleVoiceStorageKey(languageCode), voiceId);
}
