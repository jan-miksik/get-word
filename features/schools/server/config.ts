import type { SchoolBenefitLimits, SchoolPlan, SchoolRole } from '@/features/schools/types';

export const SCHOOL_CODE_MIN_LENGTH = 12;
export const SCHOOL_CODE_MAX_LENGTH = 64;
export const SCHOOL_TRANSLATION_REQUEST_ID_MAX_LENGTH = 64;
export const SCHOOL_TRANSLATION_PROMPT_VERSION = 1;
const SCHOOL_OPENROUTER_DEFAULT_MODEL = 'anthropic/claude-sonnet-5';

export const SCHOOL_PLAN_LIMITS: Record<SchoolPlan, Record<SchoolRole, SchoolBenefitLimits>> = {
  pilot_v1: {
    student: {
      photoLabMonthlyLimit: 25,
      translationItemsMonthlyLimit: 1000,
      translationItemMaxChars: 160,
    },
    teacher: {
      photoLabMonthlyLimit: 25,
      translationItemsMonthlyLimit: 1000,
      translationItemMaxChars: 160,
    },
  },
};

export function getSchoolOpenRouterModel() {
  return process.env.SCHOOL_OPENROUTER_TRANSLATION_MODEL?.trim()
    || SCHOOL_OPENROUTER_DEFAULT_MODEL;
}
