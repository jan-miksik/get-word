import { useMemo } from 'react';
import { SURVEY_DEFINITIONS } from './definitions';
import type { SurveyDefinition } from './types';

export interface UseEligibleSurveyOptions {
  surveyProgressCount: number;
  surveyResponses: Record<string, { dismissed: boolean }>;
  surveyEligibility: Record<string, boolean>;
}

/**
 * The single next survey to show, or null. Sorting by threshold ascending is
 * what makes "show both eventually, lowest first, never both at once" fall
 * out for free — no separate queue/priority mechanism needed.
 */
export function useEligibleSurvey({
  surveyProgressCount,
  surveyResponses,
  surveyEligibility,
}: UseEligibleSurveyOptions): SurveyDefinition | null {
  return useMemo(() => {
    const candidates = SURVEY_DEFINITIONS
      .filter((survey) => survey.threshold <= surveyProgressCount)
      .filter((survey) => !surveyResponses[survey.id])
      // An unset/false eligibility flag is treated as "not eligible yet" —
      // the safe default before the first sync completes.
      .filter((survey) => !survey.requiresPriorUsage || surveyEligibility[survey.id] === true)
      .sort((a, b) => a.threshold - b.threshold);
    return candidates[0] ?? null;
  }, [surveyProgressCount, surveyResponses, surveyEligibility]);
}
