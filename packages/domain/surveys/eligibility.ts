import { SURVEYS } from './spec';

/**
 * Which prior-usage-gated surveys this user may be asked.
 *
 * "Prior usage" means the account existed before the feature shipped — a
 * learner who has only ever seen the current app has nothing to compare "the
 * recent changes" against. That fact is a single durable flag on the user row
 * (`survey_prior_user`, stamped by migration 0076 at the moment the
 * environment rolled the feature out), so this is a pure function of a row the
 * caller has already loaded: no cutoff timestamp to set correctly ahead of a
 * deploy, and no query.
 *
 * It replaced an `EXISTS` probe over `review_events`, which cost a scan of the
 * highest-volume table on every sync read and, worse, decayed: once the
 * 30-day compaction window (scripts/compact-review-events.ts) passed the
 * cutoff, no row survived to prove anyone's prior usage and the survey
 * silently stopped reaching everybody.
 */
export function buildSurveyEligibility(user: { surveyPriorUser?: boolean | null }): Record<string, boolean> {
  const eligible = user.surveyPriorUser === true;
  return Object.fromEntries(
    SURVEYS.filter((survey) => survey.requiresPriorUsage).map((survey) => [survey.id, eligible]),
  );
}
