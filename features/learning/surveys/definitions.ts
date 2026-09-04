import { SURVEYS, type SurveySpec } from '@/packages/domain/surveys/spec';
import type { SurveyDefinition, SurveyOptionDefinition } from './types';

/**
 * i18n keys layered on top of packages/domain/surveys/spec.ts's `SURVEYS` —
 * that file stays the single source of truth for ids/thresholds/prior-usage
 * gating/which options reveal free text (it's also what the server validates
 * an incoming choice against), so this file only ever adds label/copy keys,
 * never redeclares the structural facts.
 */
const OPTION_LABELS: Record<string, Partial<Record<string, string>>> = {
  recent_changes: {
    great: 'survey.recentChanges.optionGreat',
    good: 'survey.recentChanges.optionGood',
    worse: 'survey.recentChanges.optionWorse',
    other: 'survey.recentChanges.optionOther',
  },
  bug_check: {
    no_issues: 'survey.bugCheck.optionNoIssues',
    minor_issues: 'survey.bugCheck.optionMinorIssues',
    major_issues: 'survey.bugCheck.optionMajorIssues',
  },
};

const QUESTION_KEYS: Record<string, string> = {
  recent_changes: 'survey.recentChanges.question',
  bug_check: 'survey.bugCheck.question',
};

const FREE_TEXT_INTRO_KEYS: Record<string, string> = {
  bug_check: 'survey.bugCheck.freeTextIntro',
};

const FREE_TEXT_PLACEHOLDER_KEYS: Record<string, string> = {
  recent_changes: 'survey.recentChanges.freeTextPlaceholder',
  bug_check: 'survey.bugCheck.freeTextPlaceholder',
};

function toDefinition(spec: SurveySpec): SurveyDefinition {
  const options: SurveyOptionDefinition[] = spec.options.map((option) => ({
    id: option.id,
    labelKey: (OPTION_LABELS[spec.id]?.[option.id] ?? spec.id) as SurveyOptionDefinition['labelKey'],
    revealsFreeText: option.revealsFreeText,
    freeTextIntroKey: option.revealsFreeText
      ? (FREE_TEXT_INTRO_KEYS[spec.id] as SurveyOptionDefinition['freeTextIntroKey'])
      : undefined,
    freeTextPlaceholderKey: option.revealsFreeText
      ? (FREE_TEXT_PLACEHOLDER_KEYS[spec.id] as SurveyOptionDefinition['freeTextPlaceholderKey'])
      : undefined,
  }));
  return {
    id: spec.id,
    threshold: spec.threshold,
    requiresPriorUsage: spec.requiresPriorUsage,
    questionKey: QUESTION_KEYS[spec.id] as SurveyDefinition['questionKey'],
    options,
  };
}

export const SURVEY_DEFINITIONS: SurveyDefinition[] = SURVEYS.map(toDefinition);
