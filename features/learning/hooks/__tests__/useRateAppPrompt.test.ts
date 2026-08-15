import { describe, expect, it } from 'vitest';
import {
  RATE_PROMPT_MIN_DAYS_SINCE_FIRST_STUDY,
  RATE_PROMPT_MIN_STUDIED_CARDS,
  hasReachedRatePromptMilestone,
} from '@/features/learning/hooks/useRateAppPrompt';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 15);

const daysAgo = (days: number) => NOW - days * DAY_MS;

describe('hasReachedRatePromptMilestone', () => {
  it('stays quiet before enough cards have been studied', () => {
    expect(
      hasReachedRatePromptMilestone(
        {
          studiedCards: RATE_PROMPT_MIN_STUDIED_CARDS - 1,
          firstStudyAt: daysAgo(30),
        },
        NOW
      )
    ).toBe(false);
  });

  it('stays quiet when a big card count was reached in one short burst', () => {
    // The whole point of the second threshold: 200 cards on day one is a first
    // sitting, not sustained use.
    expect(
      hasReachedRatePromptMilestone({ studiedCards: 200, firstStudyAt: daysAgo(1) }, NOW)
    ).toBe(false);
  });

  it('stays quiet when nothing has been studied yet', () => {
    expect(
      hasReachedRatePromptMilestone({ studiedCards: 0, firstStudyAt: null }, NOW)
    ).toBe(false);
  });

  it('fires once both thresholds are met', () => {
    expect(
      hasReachedRatePromptMilestone(
        {
          studiedCards: RATE_PROMPT_MIN_STUDIED_CARDS,
          firstStudyAt: daysAgo(RATE_PROMPT_MIN_DAYS_SINCE_FIRST_STUDY),
        },
        NOW
      )
    ).toBe(true);
  });
});
