import type { TranslateFn } from './api';

export type TtsLanguageOption = {
  code: string;
  name: string;
  ttsVoices?: string[];
  ttsVoiceGenders?: Record<string, string>;
  preferredVoice?: string | null;
};

export function formatLanguage(code: string, t: TranslateFn): string {
  const normalized = code.toLowerCase();
  if (normalized === 'cs' || normalized === 'cz') return t('languageName.cs');
  if (normalized === 'vi') return t('languageName.vi');
  if (normalized === 'en') return t('languageName.en');
  return code.toUpperCase();
}

export function getBaseLanguage(code: string): string {
  return code.toLowerCase().split('-')[0];
}
