'use client';

import { useState, useCallback, useEffect } from 'react';
import { enqueueOp } from '@/lib/local-first/enqueue';
import { postTabMessage, subscribeTabMessages } from '@/lib/tab-sync';
import type { SyncResponse } from '@/features/sync/contracts';

export interface SurveyResponseValue {
  choice: string | null;
  freeText: string | null;
  dismissed: boolean;
}
type SurveyResponsesMap = Record<string, SurveyResponseValue>;
type SurveyEligibilityMap = Record<string, boolean>;

function fromWire(value: { choice: string | null; free_text: string | null; dismissed: boolean }): SurveyResponseValue {
  return { choice: value.choice, freeText: value.free_text, dismissed: value.dismissed };
}

/**
 * Per-survey answers/dismissals. Responses are write-once and terminal on
 * the server (see lib/db/queries/survey-responses.ts), so this hook never
 * merges local-favored — `applyServerSurveyResponses` fully replaces the
 * local map with whatever the server reports. An optimistic local submit
 * still survives an unrelated server snapshot arriving before its outbox op
 * is acknowledged, because `applyPendingOutboxToSyncResponse`
 * (lib/local-first/hydrate.ts) replays pending ops onto the incoming
 * snapshot before it ever reaches this hook.
 */
export function useSurveyResponses() {
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponsesMap>({});
  const [surveyEligibility, setSurveyEligibility] = useState<SurveyEligibilityMap>({});

  const submitSurveyResponse = useCallback((surveyId: string, choice: string, freeText: string | null) => {
    const value: SurveyResponseValue = { choice, freeText, dismissed: false };
    setSurveyResponses((prev) => ({ ...prev, [surveyId]: value }));
    postTabMessage({ type: 'survey_response_changed', surveyId, response: value });
    void enqueueOp({
      entity: 'survey_response',
      opType: 'set',
      payload: { surveyId, choice: value.choice, freeText: value.freeText, dismissed: value.dismissed },
      legacyPayload: {
        survey_responses: { [surveyId]: { choice, free_text: freeText, dismissed: false } },
      },
    }).catch((e) => console.error('[useSurveyResponses] enqueue submit:', e));
  }, []);

  const dismissSurvey = useCallback((surveyId: string) => {
    const value: SurveyResponseValue = { choice: null, freeText: null, dismissed: true };
    setSurveyResponses((prev) => ({ ...prev, [surveyId]: value }));
    postTabMessage({ type: 'survey_response_changed', surveyId, response: value });
    void enqueueOp({
      entity: 'survey_response',
      opType: 'set',
      payload: { surveyId, choice: null, freeText: null, dismissed: true },
      legacyPayload: {
        survey_responses: { [surveyId]: { choice: null, free_text: null, dismissed: true } },
      },
    }).catch((e) => console.error('[useSurveyResponses] enqueue dismiss:', e));
  }, []);

  const applyServerSurveyResponses = useCallback(
    (responses: NonNullable<SyncResponse['survey_responses']>) => {
      const next: SurveyResponsesMap = {};
      for (const [surveyId, value] of Object.entries(responses)) next[surveyId] = fromWire(value);
      setSurveyResponses(next);
    },
    []
  );

  const applyServerSurveyEligibility = useCallback(
    (eligibility: NonNullable<SyncResponse['survey_eligibility']>) => {
      setSurveyEligibility(eligibility);
    },
    []
  );

  useEffect(() => {
    return subscribeTabMessages((message) => {
      if (message.type !== 'survey_response_changed') return;
      setSurveyResponses((prev) => {
        // Terminal per survey — if this tab already recorded its own answer
        // or dismissal, another tab's broadcast can't change it.
        if (prev[message.surveyId]) return prev;
        return { ...prev, [message.surveyId]: message.response };
      });
    });
  }, []);

  return {
    surveyResponses,
    surveyEligibility,
    submitSurveyResponse,
    dismissSurvey,
    applyServerSurveyResponses,
    applyServerSurveyEligibility,
  };
}
