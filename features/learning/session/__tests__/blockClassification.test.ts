import { describe, expect, it } from 'vitest';

import type { ProgressData } from '@/features/sync/contracts';
import {
  sessionPlanMatchesProgress,
  skipsReinforcement,
  wasIntroducedOnDay,
  wordMatchesSessionBlock,
} from '../blockClassification';
import type { SessionPlan } from '../plan';

const DAY = '2026-08-20';
const today = Date.parse(`${DAY}T12:00:00Z`);
const yesterday = Date.parse('2026-08-19T12:00:00Z');
const introduced = (at = yesterday): ProgressData => ({
  stageIndex: 1,
  knownCount: 1,
  unknownCount: 0,
  introducedAt: at,
  lastKnownAt: at,
});

function plan(blocks: SessionPlan['blocks']): SessionPlan {
  return {
    enabled: true,
    sessionItemCap: 2,
    priorityIds: [],
    dueIds: [],
    newIds: [],
    deferredDueCount: 0,
    shortfall: 0,
    newShortfall: 0,
    reason: 'normal',
    blocks,
  };
}

describe('session block classification', () => {
  it('recognizes an introduction in the learner\'s local day', () => {
    expect(wasIntroducedOnDay(introduced(today), DAY, 'UTC')).toBe(true);
    expect(wasIntroducedOnDay(introduced(yesterday), DAY, 'UTC')).toBe(false);
  });

  it('never renders an unseen word as an ordinary review', () => {
    expect(wordMatchesSessionBlock({ kind: 'review' }, undefined)).toBe(false);
    expect(wordMatchesSessionBlock({ kind: 'review' }, introduced())).toBe(true);
  });

  it('only opens reinforcement after the new word was committed', () => {
    const block = { kind: 'review' as const, reinforcement: true as const };
    expect(wordMatchesSessionBlock(block, undefined)).toBe(false);
    expect(wordMatchesSessionBlock(block, undefined, true)).toBe(true);
    expect(wordMatchesSessionBlock(block, introduced(today))).toBe(true);
  });

  // Choosing a longer interval on the introduction is a decision, not a guess:
  // checking the word again a minute later would contradict it.
  it('leaves out a word whose introduction chose a longer interval', () => {
    const block = { kind: 'review' as const, reinforcement: true as const };
    const atStage = (stageIndex: number): ProgressData => ({
      ...introduced(today), stageIndex,
    });

    expect(skipsReinforcement(atStage(0))).toBe(false);
    expect(skipsReinforcement(atStage(1))).toBe(false);
    expect(skipsReinforcement(atStage(3))).toBe(true);
    // Forgotten on the introduction: back to stage zero and still worth asking.
    expect(wordMatchesSessionBlock(block, atStage(0))).toBe(true);
    expect(wordMatchesSessionBlock(block, atStage(1))).toBe(true);
    expect(wordMatchesSessionBlock(block, atStage(3))).toBe(false);
    // "I know this one perfectly" retires it at the top stage.
    expect(wordMatchesSessionBlock(block, atStage(7))).toBe(false);
    // An ordinary repeat block is untouched by the rule.
    expect(wordMatchesSessionBlock({ kind: 'review' }, atStage(3))).toBe(true);
  });

  it('rejects a cached review block that now points at an unseen word', () => {
    const cached = plan([{ key: 'review-0', kind: 'review', ids: ['fresh'] }]);
    expect(sessionPlanMatchesProgress(cached, {}, DAY, 'UTC')).toBe(false);
  });

  it('keeps a completed new block introduced today but rejects old introductions', () => {
    const cached = plan([{ key: 'new-0', kind: 'new', ids: ['fresh'] }]);
    expect(sessionPlanMatchesProgress(cached, { fresh: introduced(today) }, DAY, 'UTC')).toBe(true);
    expect(sessionPlanMatchesProgress(cached, { fresh: introduced(yesterday) }, DAY, 'UTC')).toBe(false);
  });

  it('allows a future reinforcement block to reference its still-unseen new words', () => {
    const cached = plan([
      { key: 'new-0', kind: 'new', ids: ['fresh'] },
      { key: 'review-0', kind: 'review', ids: ['fresh'], pass: 2, reinforcement: true },
    ]);
    expect(sessionPlanMatchesProgress(cached, {}, DAY, 'UTC')).toBe(true);
  });
});
