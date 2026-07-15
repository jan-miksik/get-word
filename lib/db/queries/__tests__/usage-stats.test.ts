import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecute = vi.fn();

vi.mock('../../client', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

import { getUsageStats } from '../usage-stats';

// Wednesday 2026-07-15 → current UTC week starts Monday 2026-07-13.
const NOW = new Date('2026-07-15T12:00:00.000Z');
const CURRENT_WEEK = '2026-07-13';
const PREVIOUS_WEEK = '2026-07-06';
const OLDEST_WEEK = '2026-04-27'; // 11 weeks before current

function mockAllQueries({
  registrations = [{ registered_total: 10, registered_email: 6, registered_google: 3, registered_other: 1, anonymous_total: 40 }],
  registrationsWeekly = [] as Record<string, unknown>[],
  activity = [{ dau: 3, wau: 8, mau: 20, mau_registered: 9, mau_anonymous: 11 }],
  study = [{ known_30d: 100, really_known_30d: 30, unknown_30d: 50, studying_users_30d: 7 }],
  studyWeekly = [] as Record<string, unknown>[],
  content = [{ total_lists: 12, public_lists: 5, total_subscriptions: 25 }],
  topLists = [] as Record<string, unknown>[],
  retention = [{ d1_eligible: 10, d1_returned: 6, d7_eligible: 9, d7_returned: 4, d30_eligible: 8, d30_returned: 2 }],
} = {}) {
  mockExecute
    .mockResolvedValueOnce(registrations)
    .mockResolvedValueOnce(registrationsWeekly)
    .mockResolvedValueOnce(activity)
    .mockResolvedValueOnce(study)
    .mockResolvedValueOnce(studyWeekly)
    .mockResolvedValueOnce(content)
    .mockResolvedValueOnce(topLists)
    .mockResolvedValueOnce(retention);
}

describe('getUsageStats', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('assembles all sections from the eight queries', async () => {
    mockAllQueries({
      registrationsWeekly: [
        { week_start: PREVIOUS_WEEK, registrations: 2 },
        { week_start: CURRENT_WEEK, registrations: 1 },
      ],
      studyWeekly: [{ week_start: CURRENT_WEEK, reviews: 42, active_users: 4 }],
      topLists: [
        { id: 'l1', name: 'Basics', language_from: 'cs', language_to: 'en', subscriber_count: 9 },
      ],
    });

    const stats = await getUsageStats();

    expect(mockExecute).toHaveBeenCalledTimes(8);
    expect(stats.generatedAt).toBe(NOW.toISOString());
    expect(stats.registrations).toMatchObject({
      total: 10,
      email: 6,
      google: 3,
      other: 1,
      anonymous: 40,
    });
    expect(stats.activity).toEqual({
      dau: 3,
      wau: 8,
      mau: 20,
      mauRegistered: 9,
      mauAnonymous: 11,
    });
    expect(stats.study).toMatchObject({
      known30d: 100,
      reallyKnown30d: 30,
      unknown30d: 50,
      studyingUsers30d: 7,
    });
    expect(stats.content).toEqual({
      totalLists: 12,
      publicLists: 5,
      totalSubscriptions: 25,
      topLists: [
        { id: 'l1', name: 'Basics', languageFrom: 'cs', languageTo: 'en', subscriberCount: 9 },
      ],
    });
    expect(stats.retention).toEqual({
      d1: { eligible: 10, returned: 6 },
      d7: { eligible: 9, returned: 4 },
      d30: { eligible: 8, returned: 2 },
    });
  });

  it('returns exactly 12 zero-filled weeks with only the last marked partial', async () => {
    mockAllQueries({
      registrationsWeekly: [{ week_start: PREVIOUS_WEEK, registrations: 2 }],
      studyWeekly: [{ week_start: OLDEST_WEEK, reviews: 5, active_users: 2 }],
    });

    const stats = await getUsageStats();

    expect(stats.registrations.weekly).toHaveLength(12);
    expect(stats.study.weekly).toHaveLength(12);

    expect(stats.registrations.weekly[0]).toEqual({ weekStart: OLDEST_WEEK, count: 0 });
    expect(stats.registrations.weekly[10]).toEqual({ weekStart: PREVIOUS_WEEK, count: 2 });
    expect(stats.registrations.weekly[11]).toEqual({
      weekStart: CURRENT_WEEK,
      count: 0,
      partial: true,
    });
    expect(stats.study.weekly[0]).toEqual({ weekStart: OLDEST_WEEK, reviews: 5, activeUsers: 2 });
    expect(
      stats.study.weekly.filter((week) => week.partial).map((week) => week.weekStart)
    ).toEqual([CURRENT_WEEK]);
  });

  it('defaults everything to zero on empty result sets', async () => {
    mockExecute.mockResolvedValue([]);

    const stats = await getUsageStats();

    expect(stats.registrations).toMatchObject({ total: 0, email: 0, google: 0, other: 0, anonymous: 0 });
    expect(stats.activity).toEqual({ dau: 0, wau: 0, mau: 0, mauRegistered: 0, mauAnonymous: 0 });
    expect(stats.study).toMatchObject({ known30d: 0, reallyKnown30d: 0, unknown30d: 0, studyingUsers30d: 0 });
    expect(stats.content).toEqual({ totalLists: 0, publicLists: 0, totalSubscriptions: 0, topLists: [] });
    expect(stats.retention).toEqual({
      d1: { eligible: 0, returned: 0 },
      d7: { eligible: 0, returned: 0 },
      d30: { eligible: 0, returned: 0 },
    });
    expect(stats.registrations.weekly.every((week) => week.count === 0)).toBe(true);
  });

  it('holds the cross-section invariants on the assembled result', async () => {
    mockAllQueries();

    const stats = await getUsageStats();

    // These verify assembly consistency; the SQL itself is sanity-checked
    // manually against the dev DB (see plan/verification).
    expect(stats.registrations.email + stats.registrations.google + stats.registrations.other).toBe(
      stats.registrations.total
    );
    expect(stats.activity.mauRegistered + stats.activity.mauAnonymous).toBe(stats.activity.mau);
    expect(stats.activity.dau).toBeLessThanOrEqual(stats.activity.wau);
    expect(stats.activity.wau).toBeLessThanOrEqual(stats.activity.mau);
    expect(stats.content.publicLists).toBeLessThanOrEqual(stats.content.totalLists);
    for (const bucket of [stats.retention.d1, stats.retention.d7, stats.retention.d30]) {
      expect(bucket.returned).toBeLessThanOrEqual(bucket.eligible);
    }
  });
});
