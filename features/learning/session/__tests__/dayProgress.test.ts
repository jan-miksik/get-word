import { describe, expect, it } from 'vitest';
import { computeBlockProgress, answeredOnDay } from '../dayProgress';

const dayKey = '2026-08-20';

describe('session day progress', () => {
  it('uses local-day answers as a monotonic frozen-plan numerator', () => {
    const today = Date.parse('2026-08-20T10:00:00Z');
    const yesterday = Date.parse('2026-08-19T23:59:00Z');
    expect(answeredOnDay({ stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: today }, dayKey, 'UTC')).toBe(true);
    expect(answeredOnDay({ stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: yesterday }, dayKey, 'UTC')).toBe(false);

    const [progress] = computeBlockProgress(
      [{ key: 'review-0', kind: 'review', ids: ['returning', 'missing', 'fresh'] }],
      {
        progress: {
          returning: { stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: today },
          missing: { stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: yesterday },
        },
        liveIds: new Set(['returning']),
        dayKey,
        timezone: 'UTC',
      },
    );
    expect(progress).toEqual({
      key: 'review-0', kind: 'review', total: 3, done: 1, pending: 0, liveRemaining: 1, unavailable: 2,
    });
  });

  it('counts an answer still queued behind the deck animation, but only once', () => {
    const today = Date.parse('2026-08-20T10:00:00Z');
    const [progress] = computeBlockProgress(
      [{ key: 'review-0', kind: 'review', ids: ['committed', 'queued', 'untouched'] }],
      {
        progress: { committed: { stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: today } },
        liveIds: new Set(['queued', 'untouched']),
        dayKey,
        timezone: 'UTC',
        pendingIds: new Set(['committed', 'queued']),
      },
    );
    expect(progress).toMatchObject({ done: 1, pending: 1 });
  });

  it('settles a second-pass block on a second answer, counting from the frozen baseline', () => {
    const block = { key: 'review-1', kind: 'review' as const, ids: ['once', 'twice'], pass: 2 };
    const input = {
      progress: {
        once: { stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: Date.parse('2026-08-20T10:00:00Z') },
        twice: { stageIndex: 2, knownCount: 2, unknownCount: 0, lastKnownAt: Date.parse('2026-08-20T10:05:00Z') },
      },
      liveIds: new Set<string>(),
      settlingIds: new Set(['once', 'twice']),
      dayKey,
      timezone: 'UTC',
      answerBaseline: { once: 0, twice: 0 },
    };
    // One answer today is the *first* pass: the block still owes the repeat,
    // and a settling word counts as available to it even though it is not due.
    expect(computeBlockProgress([block], input)[0]).toMatchObject({ done: 1, liveRemaining: 2, unavailable: 0 });
    // A single-pass block would have called both of them finished.
    expect(computeBlockProgress([{ ...block, pass: 1 }], input)[0]).toMatchObject({ done: 2, liveRemaining: 0 });
  });
});
