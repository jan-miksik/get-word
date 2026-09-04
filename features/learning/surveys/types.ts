import type { I18nKey } from '@/lib/i18n/messages';

export interface SurveyOptionDefinition {
  id: string;
  labelKey: I18nKey;
  revealsFreeText?: boolean;
  freeTextIntroKey?: I18nKey;
  freeTextPlaceholderKey?: I18nKey;
}

export interface SurveyDefinition {
  id: string;
  threshold: number;
  requiresPriorUsage?: boolean;
  questionKey: I18nKey;
  options: SurveyOptionDefinition[];
}
