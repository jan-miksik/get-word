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
        returning: { stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: today },
        missing: { stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: yesterday },
      },
      new Set(['returning']),
      dayKey,
      'UTC',
    );
    expect(progress).toEqual({
      key: 'review-0', kind: 'review', total: 3, done: 1, liveRemaining: 1, unavailable: 2,
    });
  });
});
