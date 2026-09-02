import { describe, expect, it } from 'vitest';

import { planSessionPreflight } from '../preflight';
import type { SessionPlan } from '../plan';

function plan(overrides: Partial<SessionPlan> = {}): SessionPlan {
  return {
    enabled: true,
    sessionItemCap: 30,
    priorityIds: [],
    dueIds: [],
    newIds: [],
    deferredDueCount: 0,
    shortfall: 9,
    newShortfall: 9,
    newTarget: 12,
    reason: 'normal',
    blocks: [],
    ...overrides,
  };
}

function preflight(overrides: Parameters<typeof planSessionPreflight>[0] | Partial<Parameters<typeof planSessionPreflight>[0]> = {}) {
  return planSessionPreflight({
    plan: plan(),
    goalEnabled: true,
    goalStatus: 'active',
    answeredToday: 0,
    dismissed: false,
    ...overrides,
  });
}

describe('planSessionPreflight', () => {
  it('offers the missing words before the day starts', () => {
    expect(preflight()).toEqual({
      plannedNewWords: 12,
      availableNewWords: 3,
      missingNewWords: 9,
    });
  });

  it('says nothing when the lists can fill the day', () => {
    expect(preflight({ plan: plan({ shortfall: 0, newShortfall: 0 }) })).toBeNull();
  });

  it('does not interrupt the start over a word or two', () => {
    expect(preflight({ plan: plan({ shortfall: 2, newShortfall: 2 }) })).toBeNull();
  });

  // The day can also come up short because the repeats it was sized for are not
  // due yet. Adding words does not create a due review, so the offer would be
  // sending the learner to the chat to fix something the chat cannot fix.
  it('stays quiet when the gap is repeats rather than new words', () => {
    expect(preflight({ plan: plan({ shortfall: 9, newShortfall: 0 }) })).toBeNull();
  });

  it('is gone once the first answer is in', () => {
    expect(preflight({ answeredToday: 1 })).toBeNull();
  });

  it('stays away for the rest of the session once it is dismissed', () => {
    expect(preflight({ dismissed: true })).toBeNull();
  });

  it('has nothing to say without a goal, or on a day with nothing due', () => {
    expect(preflight({ goalEnabled: false })).toBeNull();
    expect(preflight({ goalStatus: 'nothing_due' })).toBeNull();
  });

  it('has nothing to say before a plan exists', () => {
    expect(preflight({ plan: null })).toBeNull();
    expect(preflight({ plan: plan({ enabled: false }) })).toBeNull();
    expect(preflight({ plan: plan({ sessionItemCap: null }) })).toBeNull();
    expect(preflight({ plan: plan({ newTarget: undefined }) })).toBeNull();
  });
});
