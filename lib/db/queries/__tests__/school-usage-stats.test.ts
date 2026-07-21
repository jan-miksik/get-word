import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecute = vi.fn();

vi.mock('../../client', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

import { getSchoolUsageStats } from '../school-usage-stats';

// Wednesday 2026-07-15 → current UTC week starts Monday 2026-07-13.
const NOW = new Date('2026-07-15T12:00:00.000Z');
const CURRENT_WEEK = '2026-07-13';
const PREVIOUS_WEEK = '2026-07-06';
const OLDEST_WEEK = '2026-04-27'; // 11 weeks before current
const MONTH_START = '2026-07-01T00:00:00.000Z';
const SCHOOL_ID = 'school-a';

/** Flatten a drizzle SQL template back into searchable, whitespace-normalized text. */
function sqlText(query: unknown): string {
  return rawSqlText(query).replace(/\s+/g, ' ').trim();
}

function rawSqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return '';
  return chunks
    .map((chunk) => {
      if (typeof chunk === 'string') return chunk;
      const value = (chunk as { value?: unknown }).value;
      if (Array.isArray(value)) return value.join(' ');
      if (typeof value === 'string') return value;
      return rawSqlText(chunk);
    })
    .join(' ');
}

type Rows = Record<string, unknown>[];

const SCHOOL_ROW = {
  id: SCHOOL_ID,
  name: 'Pilot School',
  plan: 'pilot_v1',
  status: 'active',
  pilot_expires_at: null,
  student_seat_limit: 30,
  teacher_limit: 5,
  active_students: 2,
  active_teachers: 1,
};

/**
 * The aggregation runs its section queries through Promise.all, so responses
 * are matched on query content rather than call order.
 */
function mockQueries(overrides: Partial<Record<string, Rows>> = {}) {
  const responses: Record<string, Rows> = {
    school: [SCHOOL_ROW],
    joinedWeekly: [],
    activity: [{ dau: 1, wau: 2, mau: 3 }],
    study30d: [{ known_30d: 40, really_known_30d: 10, unknown_30d: 5, studying_members_30d: 2 }],
    studyWeekly: [],
    aiUsage: [{ translation_items_used: 120, photo_lab_used: 7 }],
    translationRequests: [
      {
        requests: 5,
        completed: 3,
        failed: 1,
        released: 1,
        in_flight: 0,
        characters_charged: 900,
        characters_reserved: 0,
      },
    ],
    membersAtLimit: [],
    contentTotals: [
      { teacher_lists_created: 4, public_teacher_lists: 2, member_subscriptions: 9 },
    ],
    topLists: [],
    members: [],
    ...overrides,
  };

  mockExecute.mockImplementation((query: unknown) => {
    const text = sqlText(query);
    if (text.includes('FROM schools s') && text.includes('WHERE s.id')) {
      return Promise.resolve(responses.school);
    }
    if (text.includes("date_trunc('week', m.claimed_at)")) {
      return Promise.resolve(responses.joinedWeekly);
    }
    // The member query also selects from review_events, so it is matched first.
    if (text.includes('reviews_30d')) return Promise.resolve(responses.members);
    if (text.includes('JOIN user_devices ud')) return Promise.resolve(responses.activity);
    if (text.includes("date_trunc('week', re.server_created_at)")) {
      return Promise.resolve(responses.studyWeekly);
    }
    if (text.includes('FROM review_events re')) return Promise.resolve(responses.study30d);
    if (text.includes('translation_items_used')) return Promise.resolve(responses.aiUsage);
    if (text.includes('FROM school_translation_requests')) {
      return Promise.resolve(responses.translationRequests);
    }
    if (text.includes('GROUP BY m.id, m.role')) return Promise.resolve(responses.membersAtLimit);
    if (text.includes('teacher_lists_created')) return Promise.resolve(responses.contentTotals);
    if (text.includes('school_subscriber_count')) return Promise.resolve(responses.topLists);
    throw new Error(`Unmatched query: ${text.slice(0, 200)}`);
  });
}

/** All SQL the aggregation issued, for predicate assertions. */
function issuedSql(): string[] {
  return mockExecute.mock.calls.map((call) => sqlText(call[0]));
}

describe('getSchoolUsageStats', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for an unknown school without running section queries', async () => {
    mockQueries({ school: [] });

    const stats = await getSchoolUsageStats(SCHOOL_ID);

    expect(stats).toBeNull();
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('assembles school, seats and billed AI usage', async () => {
    mockQueries();

    const stats = await getSchoolUsageStats(SCHOOL_ID);

    expect(stats?.school).toEqual({
      id: SCHOOL_ID,
      name: 'Pilot School',
      plan: 'pilot_v1',
      status: 'active',
      pilotExpiresAt: null,
    });
    expect(stats?.seats).toEqual({
      studentLimit: 30,
      activeStudents: 2,
      teacherLimit: 5,
      activeTeachers: 1,
    });
    expect(stats?.ai.translation).toMatchObject({
      itemsUsed: 120,
      requests: 5,
      completed: 3,
      failed: 1,
      released: 1,
      inFlight: 0,
      charactersCharged: 900,
      charactersReserved: 0,
    });
    expect(stats?.ai.photoLab.used).toBe(7);
    expect(stats?.ai.periodStart).toBe(MONTH_START);
    expect(stats?.ai.resetAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('counts study events only inside a membership interval', async () => {
    mockQueries();

    await getSchoolUsageStats(SCHOOL_ID);

    const studyQueries = issuedSql().filter(
      (text) => text.includes('FROM review_events re') && !text.includes('reviews_30d'),
    );
    expect(studyQueries).toHaveLength(2);
    for (const text of studyQueries) {
      // Events before joining are excluded...
      expect(text).toContain('re.server_created_at >= m.claimed_at');
      // ...events after revocation are excluded, but a revoked member's earlier
      // events stay in the school's history: the interval predicate is used
      // instead of filtering on currently-active memberships.
      expect(text).toContain('m.revoked_at IS NULL OR');
      expect(text).toContain('< m.revoked_at');
      expect(text).not.toContain('m.revoked_at IS NULL AND');
    }
  });

  it('clamps activity to the day each member joined', async () => {
    mockQueries();

    await getSchoolUsageStats(SCHOOL_ID);

    const activityQuery = issuedSql().find((text) => text.includes('JOIN user_devices ud'));
    expect(activityQuery).toContain('ud.last_seen_at >= m.claimed_at');
    expect(activityQuery).toContain('m.revoked_at IS NULL');

    const memberQuery = issuedSql().find((text) => text.includes('reviews_30d'));
    expect(memberQuery).toContain('ud.last_seen_at >= m.claimed_at');
    expect(memberQuery).toContain('re.server_created_at >= m.claimed_at');
  });

  it('bills AI usage by school_id, not by current membership', async () => {
    mockQueries();

    await getSchoolUsageStats(SCHOOL_ID);

    const usageQuery = issuedSql().find((text) => text.includes('translation_items_used'));
    expect(usageQuery).toContain('FROM school_feature_usage');
    expect(usageQuery).toContain('WHERE school_id =');
    expect(usageQuery).not.toContain('school_memberships');

    const requestQuery = issuedSql().find((text) =>
      text.includes('FROM school_translation_requests'),
    );
    expect(requestQuery).toContain('WHERE school_id =');
    expect(requestQuery).not.toContain('school_memberships');
  });

  it('keeps photo lab usage separate per feature', async () => {
    mockQueries({ aiUsage: [{ translation_items_used: 0, photo_lab_used: 12 }] });

    const stats = await getSchoolUsageStats(SCHOOL_ID);

    const usageQuery = issuedSql().find((text) => text.includes('translation_items_used'));
    expect(usageQuery).toContain("feature = 'photo_lab'");
    expect(usageQuery).toContain("feature = 'ai_translation'");
    expect(stats?.ai.photoLab.used).toBe(12);
    expect(stats?.ai.translation.itemsUsed).toBe(0);
  });

  it('counts members at their own role limit', async () => {
    // pilot_v1 grants a student 1000 translation items and 25 photo analyses;
    // a teacher gets 5000 and 50. The third member spends exactly a student's
    // allowance, which for a teacher is nowhere near the limit — so a role-blind
    // comparison would wrongly report them as capped.
    mockQueries({
      membersAtLimit: [
        { role: 'student', translation_used: 1000, photo_lab_used: 3 },
        { role: 'student', translation_used: 4, photo_lab_used: 25 },
        { role: 'teacher', translation_used: 1000, photo_lab_used: 25 },
      ],
    });

    const stats = await getSchoolUsageStats(SCHOOL_ID);

    expect(stats?.ai.translation.membersAtLimit).toBe(1);
    expect(stats?.ai.photoLab.membersAtLimit).toBe(1);
    expect(stats?.ai.limits).toEqual({
      student: { translationItemsMonthly: 1000, photoLabMonthly: 25 },
      teacher: { translationItemsMonthly: 5000, photoLabMonthly: 50 },
    });
  });

  it('scopes members-at-limit to current members only', async () => {
    mockQueries();

    await getSchoolUsageStats(SCHOOL_ID);

    const query = issuedSql().find((text) => text.includes('GROUP BY m.id, m.role'));
    expect(query).toContain('m.revoked_at IS NULL');
  });

  it('names only public teacher lists in the top table', async () => {
    mockQueries({
      topLists: [
        {
          id: 'l1',
          name: 'Unit 3',
          language_from: 'cs',
          language_to: 'en',
          school_subscriber_count: 6,
        },
      ],
    });

    const stats = await getSchoolUsageStats(SCHOOL_ID);

    const topQuery = issuedSql().find((text) => text.includes('school_subscriber_count'));
    expect(topQuery).toContain('wl.is_public');
    expect(topQuery).toContain("m.role = 'teacher'");
    expect(topQuery).toContain('wl.created_at >= m.claimed_at');

    // Private lists still count towards the total, they are just never named.
    const totalsQuery = issuedSql().find((text) => text.includes('teacher_lists_created'));
    expect(totalsQuery).toContain("m.role = 'teacher'");
    expect(stats?.content).toEqual({
      teacherListsCreated: 4,
      publicTeacherLists: 2,
      memberSubscriptions: 9,
      topPublicTeacherLists: [
        {
          id: 'l1',
          name: 'Unit 3',
          languageFrom: 'cs',
          languageTo: 'en',
          schoolSubscriberCount: 6,
        },
      ],
    });
  });

  it('pseudonymizes member rows and exposes no identity fields', async () => {
    mockQueries({
      members: [
        {
          role: 'student',
          claimed_at: new Date('2026-06-02T08:30:00.000Z'),
          last_seen_at: new Date('2026-07-14T19:05:00.000Z'),
          reviews_30d: 31,
          translation_items_used: 12,
          photo_lab_used: 2,
        },
        {
          role: 'student',
          claimed_at: new Date('2026-06-03T08:30:00.000Z'),
          last_seen_at: null,
          reviews_30d: 0,
          translation_items_used: 0,
          photo_lab_used: 0,
        },
        {
          role: 'teacher',
          claimed_at: new Date('2026-06-01T08:30:00.000Z'),
          last_seen_at: new Date('2026-07-15T06:00:00.000Z'),
          reviews_30d: 4,
          translation_items_used: 300,
          photo_lab_used: 1,
        },
      ],
    });

    const stats = await getSchoolUsageStats(SCHOOL_ID);
    const members = stats?.members ?? [];

    expect(members).toHaveLength(3);
    // Ordinals restart per role and dates are day-granularity only.
    expect(members[0]).toEqual({
      ordinal: 1,
      role: 'student',
      joinedOn: '2026-06-02',
      lastActiveOn: '2026-07-14',
      reviews30d: 31,
      translationItemsUsed: 12,
      photoLabUsed: 2,
    });
    expect(members[1].ordinal).toBe(2);
    expect(members[2]).toMatchObject({ ordinal: 1, role: 'teacher' });

    // A member with no activity since joining reports null, not stale activity.
    expect(members[1].lastActiveOn).toBeNull();

    // Exact shape: a generic "contains no UUID" check would false-positive on
    // the school and list ids elsewhere in the payload.
    for (const member of members) {
      expect(Object.keys(member).sort()).toEqual([
        'joinedOn',
        'lastActiveOn',
        'ordinal',
        'photoLabUsed',
        'reviews30d',
        'role',
        'translationItemsUsed',
      ]);
    }
  });

  it('zero-fills 12 weeks and marks only the current one partial', async () => {
    mockQueries({
      joinedWeekly: [{ week_start: PREVIOUS_WEEK, joined: 3 }],
      studyWeekly: [{ week_start: CURRENT_WEEK, reviews: 42, active_users: 4 }],
    });

    const stats = await getSchoolUsageStats(SCHOOL_ID);

    expect(stats?.membership.joinedWeekly).toHaveLength(12);
    expect(stats?.membership.joinedWeekly[0]).toEqual({ weekStart: OLDEST_WEEK, count: 0 });
    expect(stats?.membership.joinedWeekly[10]).toEqual({ weekStart: PREVIOUS_WEEK, count: 3 });
    expect(stats?.membership.joinedWeekly[11]).toEqual({
      weekStart: CURRENT_WEEK,
      count: 0,
      partial: true,
    });
    expect(stats?.study.weekly[11]).toEqual({
      weekStart: CURRENT_WEEK,
      reviews: 42,
      activeUsers: 4,
      partial: true,
    });
  });

  it('switches activity windows between rolling and calendar', async () => {
    mockQueries();
    await getSchoolUsageStats(SCHOOL_ID, { activityWindow: 'calendar' });

    const calendarQuery = issuedSql().find((text) => text.includes('JOIN user_devices ud'));
    // Calendar mode measures the current UTC day/week/month, so the month
    // boundary is the 1st rather than 30 days back.
    expect(calendarQuery).toBeDefined();

    mockExecute.mockReset();
    mockQueries();
    const stats = await getSchoolUsageStats(SCHOOL_ID);
    expect(stats?.activity).toEqual({ window: 'rolling', dau: 1, wau: 2, mau: 3 });
  });
});
