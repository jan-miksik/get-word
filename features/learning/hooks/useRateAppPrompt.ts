'use client';

import { useCallback, useState } from 'react';
import {
  persistRateAppPromptAnswered,
  readRateAppPromptAnswered,
  type StudyMilestone,
} from '@/features/learning/app-state/storage';
import type { ViewMode } from '@/features/learning/app-state/types';
import { useStoreListing } from '@/hooks/useStoreListing';
import { getStoreListingUrl } from '@/lib/store-listing';

// Neutral timing: the prompt waits for sustained use rather than for a good
// moment. Both thresholds have to pass, so one long first sitting does not
// trigger it, and neither does opening the app for weeks without studying.
export const RATE_PROMPT_MIN_STUDIED_CARDS = 60;
export const RATE_PROMPT_MIN_DAYS_SINCE_FIRST_STUDY = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

type RateAppPromptOptions = {
  viewMode: ViewMode;
  studyMilestone: StudyMilestone;
};

export function hasReachedRatePromptMilestone(
  milestone: StudyMilestone,
  now: number = Date.now()
): boolean {
  if (milestone.studiedCards < RATE_PROMPT_MIN_STUDIED_CARDS) return false;
  if (milestone.firstStudyAt === null) return false;
  return now - milestone.firstStudyAt >= RATE_PROMPT_MIN_DAYS_SINCE_FIRST_STUDY * DAY_MS;
}

function readPreviewRateAppPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('previewRateAppPrompt');
}

export function useRateAppPrompt({ viewMode, studyMilestone }: RateAppPromptOptions) {
  const { url } = useStoreListing();
  const [isPreviewActive] = useState(readPreviewRateAppPrompt);
  const [answered, setAnswered] = useState(readRateAppPromptAnswered);

  const dismissRateAppPrompt = useCallback(() => {
    persistRateAppPromptAnswered(true);
    setAnswered(true);
  }, []);

  const shouldShowRateAppPrompt =
    !answered &&
    // The preview flag skips the store check so the card can be reviewed and
    // screenshotted from a desktop browser.
    (isPreviewActive ||
      (Boolean(url) && viewMode === 'card' && hasReachedRatePromptMilestone(studyMilestone)));

  return {
    dismissRateAppPrompt,
    // In preview no store resolves, so fall back to the Play listing rather
    // than rendering the card with a dead button.
    rateAppUrl: url ?? (isPreviewActive ? getStoreListingUrl('play') : null),
    shouldShowRateAppPrompt,
  };
}
