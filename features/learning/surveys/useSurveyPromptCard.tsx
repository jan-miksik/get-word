'use client';

import { useMemo, useState } from 'react';

import { SurveyPromptCard } from '@/features/learning/components/SurveyPromptCard';
import { SURVEY_DEFINITIONS } from './definitions';
import { useEligibleSurvey } from './useEligibleSurvey';

interface UseSurveyPromptCardOptions {
  surveyProgressCount: number;
  surveyResponses: Record<string, { dismissed: boolean }>;
  surveyEligibility: Record<string, boolean>;
  submitSurveyResponse: (surveyId: string, optionId: string, freeText: string | null) => void;
  dismissSurvey: (surveyId: string) => void;
}

/**
 * The survey interstitial, or null when there is nothing to ask.
 *
 * Owns the QA preview alongside the real thing, because the two differ in
 * exactly one way that must not be got wrong: a survey response is write-once
 * and terminal on the server, so letting `?previewSurvey=` submit or dismiss
 * would spend the account's only answer on a layout check and lock the real
 * prompt out forever. A previewed card therefore closes locally and records
 * nothing.
 */
export function useSurveyPromptCard({
  surveyProgressCount,
  surveyResponses,
  surveyEligibility,
  submitSurveyResponse,
  dismissSurvey,
}: UseSurveyPromptCardOptions) {
  // QA-only: force-show a specific survey regardless of threshold/eligibility,
  // mirroring the ?previewMemoryHooksIntro convention.
  const previewSurveyId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('previewSurvey');
  }, []);
  const [previewClosed, setPreviewClosed] = useState(false);
  const eligibleSurvey = useEligibleSurvey({ surveyProgressCount, surveyResponses, surveyEligibility });

  const previewSurvey = previewSurveyId && !previewClosed
    ? SURVEY_DEFINITIONS.find((survey) => survey.id === previewSurveyId) ?? null
    : null;
  const survey = previewSurvey ?? eligibleSurvey;
  if (!survey) return null;

  return (
    <SurveyPromptCard
      survey={survey}
      onSubmit={(optionId, freeText) => {
        if (previewSurvey) return setPreviewClosed(true);
        submitSurveyResponse(survey.id, optionId, freeText);
      }}
      onDismiss={() => {
        if (previewSurvey) return setPreviewClosed(true);
        dismissSurvey(survey.id);
      }}
    />
  );
}
