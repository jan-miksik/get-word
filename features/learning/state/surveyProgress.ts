'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { enqueueOp } from '@/lib/local-first/enqueue';
import { postTabMessage, subscribeTabMessages } from '@/lib/tab-sync';

/**
 * Count of eligible study answers recorded since the mini-survey feature
 * shipped. Mirrors useGameScore's shape (monotonic, max-merged across
 * devices/tabs) but only ever increments locally — there's no external
 * "set to this value" case the way a game score needs.
 */
export function useSurveyProgress(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>
) {
  const [surveyProgressCount, setSurveyProgressCountState] = useState(0);
  const syncedRef = useRef(false);
  /**
   * The committed count, kept alongside the state rather than read out of it.
   *
   * An increment has to broadcast to the other tabs, and a state updater is
   * the one place that must not: React runs an updater twice under StrictMode
   * and may run it for a render it then discards, so announcing from inside it
   * would publish a count this tab never committed. Receiving tabs max-merge
   * that number and enqueue it as a `survey_counter` op, which would push the
   * server's counter permanently past the answers actually given — and show
   * the survey early. Every write below goes through this ref first, so the
   * number that leaves the tab is always one the tab really reached.
   */
  const countRef = useRef(0);
  const raiseCount = useCallback((next: number) => {
    if (next <= countRef.current) return countRef.current;
    countRef.current = next;
    setSurveyProgressCountState(next);
    return next;
  }, []);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!syncedRef.current) {
      syncedRef.current = true;
      return;
    }
    void enqueueOp({
      entity: 'survey_counter',
      opType: 'max',
      payload: { count: surveyProgressCount },
      legacyPayload: { survey_progress_count: surveyProgressCount },
    }).catch((e) => console.error('[useSurveyProgress] enqueue:', e));
  }, [surveyProgressCount, isHydrated, isUpdatingFromServerRef]);

  const applyServerSurveyCount = useCallback((count: number) => {
    raiseCount(count);
  }, [raiseCount]);

  const incrementSurveyProgress = useCallback(() => {
    const next = raiseCount(countRef.current + 1);
    postTabMessage({ type: 'survey_progress_changed', count: next });
  }, [raiseCount]);

  useEffect(() => {
    return subscribeTabMessages((message) => {
      if (message.type !== 'survey_progress_changed') return;
      raiseCount(message.count);
    });
  }, [raiseCount]);

  return { surveyProgressCount, incrementSurveyProgress, applyServerSurveyCount };
}
