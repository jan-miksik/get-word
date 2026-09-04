/**
 * The mini-survey config's server-validation shape: just enough to check
 * that an incoming `surveyId`/`choice` pair is real. Deliberately does not
 * carry i18n keys or the free-text intro/placeholder — those are UI-only
 * concerns that live in `features/learning/surveys/definitions.ts`, which
 * mirrors this list's ids/thresholds/options so both sides share one source
 * of truth for "what surveys exist and what can be answered".
 *
 * Since survey responses are write-once (see lib/db/schema.ts's
 * `surveyResponses` table), a bad `surveyId`/`choice` would be permanent —
 * this list is what `apply-mutations.ts` checks against before writing.
 */
interface SurveyOptionSpec {
  id: string;
  revealsFreeText?: boolean;
}

export interface SurveySpec {
  id: string;
  threshold: number;
  requiresPriorUsage?: boolean;
  options: SurveyOptionSpec[];
}

export const SURVEYS: SurveySpec[] = [
  {
    id: 'recent_changes',
    threshold: 10,
    requiresPriorUsage: true,
    options: [
      { id: 'great' },
      { id: 'good' },
      { id: 'worse' },
      { id: 'other', revealsFreeText: true },
    ],
  },
  {
    id: 'bug_check',
    threshold: 50,
    options: [
      { id: 'no_issues' },
      { id: 'minor_issues', revealsFreeText: true },
      { id: 'major_issues', revealsFreeText: true },
    ],
  },
];

export function getSurveySpec(surveyId: string): SurveySpec | undefined {
  return SURVEYS.find((survey) => survey.id === surveyId);
}

export function isValidSurveyChoice(surveyId: string, choice: string): boolean {
  return getSurveySpec(surveyId)?.options.some((option) => option.id === choice) ?? false;
}

/**
 * No survey can be offered below this, so it is the point before which the
 * server has nothing to say about survey state at all.
 */
export const LOWEST_SURVEY_THRESHOLD = Math.min(...SURVEYS.map((survey) => survey.threshold));
