import type { TranslateFn } from './api';

export type TtsLanguageOption = {
  code: string;
  name: string;
  ttsVoices?: string[];
  ttsVoiceGenders?: Record<string, string>;
  preferredVoice?: string | null;
};

export function formatLanguage(code: string, t: TranslateFn): string {
  const [base, region] = code.toLowerCase().split('-');
  const label =
    base === 'cs' || base === 'cz'
      ? t('languageName.cs')
      : base === 'vi'
        ? t('languageName.vi')
        : base === 'en'
          ? t('languageName.en')
          : null;
  if (!label) return code.toUpperCase();
  // A regional variant keeps its region visible ("angličtina (US)"), otherwise
  // an American list would be indistinguishable from a British one here.
  return region ? `${label} (${region.toUpperCase()})` : label;
}

export function getBaseLanguage(code: string): string {
  return code.toLowerCase().split('-')[0];
}
