import { getBaseLanguage } from '@/lib/i18n/languages';
import type {
  WordChatAddressRegister,
  WordChatLanguageLevel,
  WordChatSalutationGender,
} from './types';

const WORD_CHAT_ADDRESS_REGISTERS = ['casual', 'formal'] as const;
const WORD_CHAT_SALUTATION_GENDERS = ['female', 'male', 'neutral'] as const;
export const WORD_CHAT_LANGUAGE_LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'] as const;

const GENDERED_SALUTATION_LANGUAGES = new Set([
  'cs', 'sk', 'pl', 'ru', 'uk',
]);

export function hasGenderedSalutation(languageCode: string): boolean {
  if (!languageCode) return false;
  return GENDERED_SALUTATION_LANGUAGES.has(getBaseLanguage(languageCode));
}

export function readAddressRegister(value: unknown): WordChatAddressRegister | null {
  return WORD_CHAT_ADDRESS_REGISTERS.includes(value as WordChatAddressRegister)
    ? (value as WordChatAddressRegister)
    : null;
}

export function readSalutationGender(value: unknown): WordChatSalutationGender | null {
  return WORD_CHAT_SALUTATION_GENDERS.includes(value as WordChatSalutationGender)
    ? (value as WordChatSalutationGender)
    : null;
}

export function readLanguageLevel(value: unknown): WordChatLanguageLevel | null {
  return WORD_CHAT_LANGUAGE_LEVELS.includes(value as WordChatLanguageLevel)
    ? (value as WordChatLanguageLevel)
    : null;
}
