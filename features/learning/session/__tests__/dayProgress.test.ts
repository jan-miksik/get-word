import { describe, expect, it } from 'vitest';
import { computeBlockProgress, answeredOnDay, countIntroducedOnDay } from '../dayProgress';

const dayKey = '2026-08-20';

describe('session day progress', () => {
  it('counts every word first met on the local day, beyond the frozen plan', () => {
    const today = Date.parse('2026-08-20T10:00:00Z');
    const yesterday = Date.parse('2026-08-19T10:00:00Z');
    const progress = Object.fromEntries([
      ...Array.from({ length: 20 }, (_, index) => [
        `today-${index}`,
        { stageIndex: 1, knownCount: 1, unknownCount: 0, introducedAt: today },
      ]),
      ['yesterday', { stageIndex: 2, knownCount: 2, unknownCount: 0, introducedAt: yesterday }],
    ]);

    expect(countIntroducedOnDay(progress, dayKey, 'UTC')).toBe(20);
  });

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
      gameTotal: 0, gameDone: 0, gameUnavailable: 0,
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
        pendingAnswers: { committed: 0, queued: 0 },
      },
    );
    expect(progress).toMatchObject({ done: 1, pending: 1 });
  });

  // One tap is one answer. A word listed in two blocks — the closing block
  // repeats what the new block just introduced — used to count that single
  // queued answer in both, so the day rail's new and review stretches grew
  // together on the same tap.
  it('credits a queued answer only to the block it actually settles', () => {
    const blocks = [
      { key: 'new-0', kind: 'new' as const, ids: ['w1'] },
      { key: 'review-1', kind: 'review' as const, ids: ['w1'], pass: 2 },
    ];
    const input = {
      liveIds: new Set(['w1']),
      settlingIds: new Set(['w1']),
      dayKey,
      timezone: 'UTC',
      answerBaseline: { w1: 0 },
    };

    // First tap: it settles the new block, and leaves the repeat untouched.
    const firstTap = computeBlockProgress(blocks, {
      ...input,
      progress: {},
      pendingAnswers: { w1: 0 },
    });
    expect(firstTap.map((block) => [block.done, block.pending])).toEqual([[0, 1], [0, 0]]);

    // Answer committed, nothing tapped since: no phantom pending anywhere.
    const committed = {
      w1: { stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: Date.parse('2026-08-20T10:00:00Z') },
    };
    const settled = computeBlockProgress(blocks, {
      ...input,
      progress: committed,
      pendingAnswers: { w1: 0 },
    });
    expect(settled.map((block) => [block.done, block.pending])).toEqual([[1, 0], [0, 0]]);

    // Second tap, on the repeat: now the repeat block is the one that moves.
    const secondTap = computeBlockProgress(blocks, {
      ...input,
      progress: committed,
      pendingAnswers: { w1: 1 },
    });
    expect(secondTap.map((block) => [block.done, block.pending])).toEqual([[1, 0], [0, 1]]);
  });

  // The bonus round is made of words already due again, and a stage-0 word falls
  // due minutes after being answered — so "answered today" would mark half the
  // bonus set done before the learner touched it. A baseline on a single-pass
  // block means "answer it once more from here".
  it('settles a single-pass block from its baseline when one is given', () => {
    const today = Date.parse('2026-08-20T10:00:00Z');
    const [progress] = computeBlockProgress(
      [{ key: 'bonus-review', kind: 'review', ids: ['answeredEarlier', 'answeredAgain'] }],
      {
        progress: {
          answeredEarlier: { stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: today },
          answeredAgain: { stageIndex: 2, knownCount: 2, unknownCount: 0, lastKnownAt: today },
        },
        liveIds: new Set(['answeredEarlier', 'answeredAgain']),
        dayKey,
        timezone: 'UTC',
        answerBaseline: { answeredEarlier: 1, answeredAgain: 1 },
      },
    );
    expect(progress).toMatchObject({ total: 2, done: 1 });
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

  it('reinforces only words reached during a clock-owned new phase', () => {
    const [progress] = computeBlockProgress(
      [{
        key: 'review-0', kind: 'review', ids: ['introduced', 'stocked'],
        pass: 2, phase: 1, reinforcement: true,
      }],
      {
        progress: {
          introduced: { stageIndex: 1, knownCount: 1, unknownCount: 0 },
        },
        liveIds: new Set(['introduced', 'stocked']),
        settlingIds: new Set(['introduced']),
        dayKey,
        timezone: 'UTC',
        answerBaseline: { introduced: 0, stocked: 0 },
      },
    );

    expect(progress).toMatchObject({ total: 1, done: 0, liveRemaining: 1, unavailable: 0 });
  });

  it('carries each block\'s minigame rounds alongside its words', () => {
    const [progress] = computeBlockProgress(
      [{ key: 'review-0', kind: 'review', ids: ['a', 'b'] }],
      {
        progress: {},
        liveIds: new Set(['a', 'b']),
        dayKey,
        timezone: 'UTC',
        blockGames: { 'review-0': { total: 3, done: 1, unavailable: 1 } },
      },
    );
    // Rounds ride beside the words rather than inside them: the block rail
    // counts every card, while the day's goal stays counted in words alone.
    expect(progress).toMatchObject({
      total: 2, done: 0, gameTotal: 3, gameDone: 1, gameUnavailable: 1,
    });
  });
});
