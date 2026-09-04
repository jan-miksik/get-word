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
  registrations = [{ registered_total: 10, registered_email: 6, registered_google: 3, registered_apple: 2, registered_other: 1, anonymous_total: 40 }],
  registrationsWeekly = [] as Record<string, unknown>[],
  activity = [{ dau: 3, wau: 8, mau: 20, yau: 30, mau_registered: 9, mau_anonymous: 11, yau_registered: 14, yau_anonymous: 16 }],
  deviceSummary = [{ active_devices_30d: 12, known_devices_30d: 9, ios_users_30d: 3, android_users_30d: 4, mobile_users_30d: 7, desktop_users_30d: 2, multi_device_users_30d: 2 }],
  devicePlatforms = [{ bucket: 'android', users: 4 }, { bucket: 'ios', users: 3 }, { bucket: 'unknown', users: 1 }] as Record<string, unknown>[],
  deviceFormFactors = [{ bucket: 'mobile', users: 5 }, { bucket: 'desktop', users: 2 }] as Record<string, unknown>[],
  study = [{ known_30d: 100, really_known_30d: 30, unknown_30d: 50, studying_users_30d: 7 }],
  studyWeekly = [] as Record<string, unknown>[],
  content = [{ total_lists: 12, public_lists: 5, total_subscriptions: 25 }],
  topLists = [] as Record<string, unknown>[],
  studiedLanguages = [] as Record<string, unknown>[],
  selectedLanguages = [] as Record<string, unknown>[],
  goals = [] as Record<string, unknown>[],
  retention = [{ d1_eligible: 10, d1_returned: 6, d7_eligible: 9, d7_returned: 4, d30_eligible: 8, d30_returned: 2 }],
  activityHeatmap = [] as Record<string, unknown>[],
  photo = [{ total_analyses: 0, photo_users: 0, repeat_users: 0, first_event_at: null }] as Record<string, unknown>[],
  photoWeekly = [] as Record<string, unknown>[],
  wordChatAccounts = [] as Record<string, unknown>[],
  googleApi = [] as Record<string, unknown>[],
  uiLanguageRequests = [] as Record<string, unknown>[],
  surveyResponses = [] as Record<string, unknown>[],
  surveyFreeText = [] as Record<string, unknown>[],
  users = [] as Record<string, unknown>[],
  userDaily = [] as Record<string, unknown>[],
  userPresenceDays = [] as Record<string, unknown>[],
  userActiveDays = [] as Record<string, unknown>[],
  // Measured-activity rollups; the two queries run after the user list.
  activitySessions = [
    { active_seconds: 0, sessions: 0, users_with_activity: 0, median_session_seconds: 0 },
  ] as Record<string, unknown>[],
  activityBySurface = [] as Record<string, unknown>[],
  userActivity = [] as Record<string, unknown>[],
  /** Simulates the activity table not existing yet (migration applied by hand). */
  activityFails = false,
} = {}) {
  mockExecute
    .mockResolvedValueOnce(registrations)
    .mockResolvedValueOnce(registrationsWeekly)
    .mockResolvedValueOnce(activity)
    .mockResolvedValueOnce(deviceSummary)
    .mockResolvedValueOnce(devicePlatforms)
    .mockResolvedValueOnce(deviceFormFactors)
    .mockResolvedValueOnce(study)
    .mockResolvedValueOnce(studyWeekly)
    .mockResolvedValueOnce(activityHeatmap)
    .mockResolvedValueOnce(content)
    .mockResolvedValueOnce(topLists)
    .mockResolvedValueOnce(studiedLanguages)
    .mockResolvedValueOnce(selectedLanguages)
    .mockResolvedValueOnce(goals)
    .mockResolvedValueOnce(retention)
    .mockResolvedValueOnce(photo)
    .mockResolvedValueOnce(photoWeekly)
    .mockResolvedValueOnce(wordChatAccounts)
    .mockResolvedValueOnce(googleApi)
    .mockResolvedValueOnce(uiLanguageRequests)
    .mockResolvedValueOnce(surveyResponses)
    .mockResolvedValueOnce(surveyFreeText)
    .mockResolvedValueOnce(users)
    .mockResolvedValueOnce(userDaily)
    .mockResolvedValueOnce(userPresenceDays)
    .mockResolvedValueOnce(userActiveDays);

  const activityError = () =>
    Promise.reject(new Error('relation "activity_segments" does not exist'));
  if (activityFails) {
    mockExecute
      .mockImplementationOnce(activityError)
      .mockImplementationOnce(activityError)
      .mockImplementationOnce(activityError);
  } else {
    mockExecute
      .mockResolvedValueOnce(activitySessions)
      .mockResolvedValueOnce(activityBySurface)
      .mockResolvedValueOnce(userActivity);
  }
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

  it('assembles all sections from the usage queries', async () => {
    mockAllQueries({
      registrationsWeekly: [
        { week_start: PREVIOUS_WEEK, registrations: 2 },
        { week_start: CURRENT_WEEK, registrations: 1 },
      ],
      studyWeekly: [{ week_start: CURRENT_WEEK, reviews: 42, active_users: 4 }],
      topLists: [
        { id: 'l1', name: 'Basics', language_from: 'cs', language_to: 'en', subscriber_count: 9, active_subscriber_count: 4 },
      ],
    });

    const stats = await getUsageStats();

    // 26 panel queries + 2 app-wide activity rollups. The per-user activity
    // query short-circuits without hitting the database when no users match.
    expect(mockExecute).toHaveBeenCalledTimes(28);
    expect(stats.generatedAt).toBe(NOW.toISOString());
    expect(stats.registrations).toMatchObject({
      total: 10,
      email: 6,
      google: 3,
      apple: 2,
      other: 1,
      anonymous: 40,
    });
    expect(stats.activity).toEqual({
      window: 'rolling',
      dau: 3,
      wau: 8,
      mau: 20,
      yau: 30,
      mauRegistered: 9,
      mauAnonymous: 11,
      yauRegistered: 14,
      yauAnonymous: 16,
    });
    expect(stats.devices).toEqual({
      activeDevices30d: 12,
      knownDevices30d: 9,
      iosUsers30d: 3,
      androidUsers30d: 4,
      mobileUsers30d: 7,
      desktopUsers30d: 2,
      multiDeviceUsers30d: 2,
      platformBreakdown30d: [
        { key: 'android', users: 4 },
        { key: 'ios', users: 3 },
        { key: 'unknown', users: 1 },
      ],
      formFactorBreakdown30d: [
        { key: 'mobile', users: 5 },
        { key: 'desktop', users: 2 },
      ],
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
        { id: 'l1', name: 'Basics', languageFrom: 'cs', languageTo: 'en', subscriberCount: 9, activeSubscriberCount: 4 },
      ],
    });
    expect(stats.retention).toEqual({
      d1: { eligible: 10, returned: 6 },
      d7: { eligible: 9, returned: 4 },
      d30: { eligible: 8, returned: 2 },
    });
    expect(stats.wordChat).toEqual({
      monthStart: '2026-07-01T00:00:00.000Z',
      monthlyLimitUsd: 2,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      accounts: [],
    });
    expect(stats.googleApi).toEqual({
      monthStart: '2026-07-01T00:00:00.000Z',
      translateFreeUnits: 500000,
      ttsFreeUnits: 1000000,
      translateUnits: 0,
      ttsUnits: 0,
      requests: 0,
      estimatedTranslationCostUsd: 0,
      sources: [],
    });
    expect(stats.uiLanguageRequests).toEqual({ totalRequests: 0, languages: [] });
    expect(stats.surveys).toEqual({ summaries: [], freeTextResponses: [] });
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
    expect(stats.activity).toEqual({
      window: 'rolling',
      dau: 0,
      wau: 0,
      mau: 0,
      yau: 0,
      mauRegistered: 0,
      mauAnonymous: 0,
      yauRegistered: 0,
      yauAnonymous: 0,
    });
    expect(stats.devices).toEqual({
      activeDevices30d: 0,
      knownDevices30d: 0,
      iosUsers30d: 0,
      androidUsers30d: 0,
      mobileUsers30d: 0,
      desktopUsers30d: 0,
      multiDeviceUsers30d: 0,
      platformBreakdown30d: [],
      formFactorBreakdown30d: [],
    });
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
    expect(stats.activity.yauRegistered + stats.activity.yauAnonymous).toBe(stats.activity.yau);
    expect(stats.activity.dau).toBeLessThanOrEqual(stats.activity.wau);
    expect(stats.activity.wau).toBeLessThanOrEqual(stats.activity.mau);
    expect(stats.activity.mau).toBeLessThanOrEqual(stats.activity.yau);
    expect(stats.content.publicLists).toBeLessThanOrEqual(stats.content.totalLists);
    for (const bucket of [stats.retention.d1, stats.retention.d7, stats.retention.d30]) {
      expect(bucket.returned).toBeLessThanOrEqual(bucket.eligible);
    }
  });

  it('marks calendar activity windows when requested', async () => {
    mockAllQueries();

    const stats = await getUsageStats({ activityWindow: 'calendar' });

    expect(stats.activity.window).toBe('calendar');
  });

  it('maps photo aggregates and derives repeat rate', async () => {
    mockAllQueries({
      photo: [{ total_analyses: 30, photo_users: 8, repeat_users: 2, first_event_at: '2026-07-01T00:00:00.000Z' }],
      photoWeekly: [{ week_start: CURRENT_WEEK, analyses: 5, users: 3 }],
    });

    const stats = await getUsageStats();

    expect(stats.photo).toMatchObject({
      totalAnalyses: 30,
      users: 8,
      repeatUsers: 2,
      repeatRate: 0.25,
      firstEventAt: '2026-07-01T00:00:00.000Z',
    });
    expect(typeof stats.photo.trackedSince).toBe('string');
    expect(stats.photo.weekly).toHaveLength(12);
    expect(stats.photo.weekly[11]).toEqual({
      weekStart: CURRENT_WEEK,
      analyses: 5,
      users: 3,
      partial: true,
    });
  });

  it('guards repeat rate against zero photo users', async () => {
    mockAllQueries({ photo: [{ total_analyses: 0, photo_users: 0, repeat_users: 0, first_event_at: null }] });

    const stats = await getUsageStats();

    expect(stats.photo.repeatRate).toBe(0);
    expect(stats.photo.firstEventAt).toBeNull();
  });

  it('aggregates current-month Word Chat tokens and estimated spend per account', async () => {
    mockAllQueries({
      wordChatAccounts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'a@example.com',
          registered: true,
          calls: 3,
          input_tokens: '1200',
          output_tokens: '300',
          estimated_cost_usd: '0.005400',
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          email: null,
          registered: false,
          calls: 1,
          input_tokens: '200',
          output_tokens: '50',
          estimated_cost_usd: '0.000900',
        },
      ],
    });

    const stats = await getUsageStats();

    expect(stats.wordChat).toMatchObject({
      monthStart: '2026-07-01T00:00:00.000Z',
      monthlyLimitUsd: 2,
      calls: 4,
      inputTokens: 1400,
      outputTokens: 350,
      estimatedCostUsd: 0.0063,
    });
    expect(stats.wordChat.accounts).toEqual([
      expect.objectContaining({
        email: 'a@example.com',
        registered: true,
        calls: 3,
        inputTokens: 1200,
        outputTokens: 300,
        estimatedCostUsd: 0.0054,
      }),
      expect.objectContaining({
        email: null,
        registered: false,
        calls: 1,
        inputTokens: 200,
        outputTokens: 50,
        estimatedCostUsd: 0.0009,
      }),
    ]);
    expect(stats.wordChat.accounts[0].handle).toMatch(/^user_[0-9a-f]{12}$/);
  });

  it('aggregates completed Google API calls by source and estimates NMT overage', async () => {
    mockAllQueries({
      googleApi: [
        {
          scope: 'translate',
          source: 'ui_locale_runtime',
          model: 'nmt-v2',
          units: '526000',
          requests: '12',
        },
        {
          scope: 'tts',
          source: 'audio_batch',
          model: 'cs-CZ-Chirp3-HD-Aoede',
          units: '1400',
          requests: '20',
        },
      ],
    });

    const stats = await getUsageStats();

    expect(stats.googleApi).toMatchObject({
      translateUnits: 526000,
      ttsUnits: 1400,
      requests: 32,
      estimatedTranslationCostUsd: 0.52,
    });
    expect(stats.googleApi.sources).toEqual([
      {
        scope: 'translate',
        source: 'ui_locale_runtime',
        model: 'nmt-v2',
        units: 526000,
        requests: 12,
      },
      {
        scope: 'tts',
        source: 'audio_batch',
        model: 'cs-CZ-Chirp3-HD-Aoede',
        units: 1400,
        requests: 20,
      },
    ]);
  });

  it('ranks requested interface languages without double-counting repeated taps', async () => {
    mockAllQueries({
      uiLanguageRequests: [
        {
          language_code: 'de',
          requesters: 4,
          last_requested_at: '2026-07-14T10:00:00.000Z',
        },
        {
          language_code: 'hi',
          requesters: 2,
          last_requested_at: '2026-07-13T10:00:00.000Z',
        },
      ],
    });

    const stats = await getUsageStats();

    expect(stats.uiLanguageRequests).toEqual({
      totalRequests: 6,
      languages: [
        { languageCode: 'de', requesters: 4, lastRequestedAt: '2026-07-14T10:00:00.000Z' },
        { languageCode: 'hi', requesters: 2, lastRequestedAt: '2026-07-13T10:00:00.000Z' },
      ],
    });
  });

  it('summarizes survey responses per survey, counting dismissals as their own outcome', async () => {
    mockAllQueries({
      surveyResponses: [
        { survey_id: 'bug_check', option_id: 'no_issues', responses: 42 },
        { survey_id: 'bug_check', option_id: 'minor_issues', responses: 5 },
        { survey_id: 'bug_check', option_id: 'dismissed', responses: 70 },
        { survey_id: 'recent_changes', option_id: 'great', responses: 3 },
      ],
      surveyFreeText: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'learner@example.com',
          survey_id: 'bug_check',
          choice: 'minor_issues',
          free_text: 'sync feels slow',
          updated_at: '2026-07-14T10:00:00.000Z',
        },
      ],
    });

    const stats = await getUsageStats();

    expect(stats.surveys.summaries).toEqual([
      {
        surveyId: 'bug_check',
        totalAnswered: 47,
        totalDismissed: 70,
        options: [
          { optionId: 'no_issues', responses: 42 },
          { optionId: 'minor_issues', responses: 5 },
        ],
      },
      {
        surveyId: 'recent_changes',
        totalAnswered: 3,
        totalDismissed: 0,
        options: [{ optionId: 'great', responses: 3 }],
      },
    ]);
    expect(stats.surveys.freeTextResponses).toEqual([
      {
        handle: expect.stringMatching(/^user_[0-9a-f]{12}$/),
        email: 'learner@example.com',
        surveyId: 'bug_check',
        optionId: 'minor_issues',
        freeText: 'sync feels slow',
        respondedAt: '2026-07-14T10:00:00.000Z',
      },
    ]);
  });

  it('maps per-user rows to a pseudonymous handle, keeping the e-mail and nullable timestamps', async () => {
    mockAllQueries({
      users: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'a@example.com',
          first_seen_at: '2026-07-01T00:00:00.000Z',
          registered_at: '2026-07-02T00:00:00.000Z',
          last_seen_at: null,
          last_device_platform: 'ios',
          last_device_form_factor: 'mobile',
          device_count: 2,
          game_score: 17,
          review_count: 1,
          active_days: 1,
          study_sessions: 1,
          est_active_study_seconds: 120,
          photo_analyses: 2,
        },
      ],
      userDaily: [
        { user_id: '11111111-1111-1111-1111-111111111111', day: '2026-07-02', reviews: 3 },
      ],
    });

    const stats = await getUsageStats();

    expect(stats.users).toHaveLength(1);
    const row = stats.users[0];
    expect(row.handle).toMatch(/^user_[0-9a-f]{12}$/);
    expect(row.handle).not.toContain('11111111');
    expect(row.email).toBe('a@example.com');
    expect(row.registeredAt).toBe('2026-07-02T00:00:00.000Z');
    expect(row.lastSeenAt).toBeNull();
    expect(row).toMatchObject({
      lastDevicePlatform: 'ios',
      lastDeviceFormFactor: 'mobile',
      deviceCount: 2,
      gameScore: 17,
      reviewCount: 1,
      activeDays: 1,
      studySessions: 1,
      estActiveStudySeconds: 120,
      photoAnalyses: 2,
    });
    expect(row.dailyActivity).toEqual([
      { date: '2026-07-02', count: 3, activeSeconds: 0 },
    ]);
  });

  it('folds studied languages into targets, directions and per-user rows', async () => {
    const alice = '11111111-1111-1111-1111-111111111111';
    const bob = '22222222-2222-2222-2222-222222222222';
    mockAllQueries({
      studiedLanguages: [
        // Alice learns English from two mother tongues: one learner of English,
        // two directions. Summing the directions would count her twice.
        { user_id: alice, language_from: 'cs', language_to: 'en', reviews: 10, reviews_30d: 4 },
        { user_id: alice, language_from: 'vi', language_to: 'en', reviews: 5, reviews_30d: 0 },
        { user_id: alice, language_from: 'cs', language_to: 'de', reviews: 2, reviews_30d: 0 },
        { user_id: bob, language_from: 'cs', language_to: 'en', reviews: 7, reviews_30d: 7 },
      ],
      selectedLanguages: [
        { language_from: 'cs', language_to: 'en', users: 9 },
        // Nobody has studied Spanish yet; it must still be visible as demand.
        { language_from: 'cs', language_to: 'es', users: 3 },
      ],
      users: [
        {
          id: alice,
          email: 'a@example.com',
          first_seen_at: '2026-07-01T00:00:00.000Z',
          registered_at: null,
          last_seen_at: null,
          selected_language_from: 'cs',
          selected_language_to: 'en',
        },
      ],
    });

    const stats = await getUsageStats();

    expect(stats.languages).toMatchObject({
      learners: 2,
      learners30d: 2,
      multiLanguageLearners: 1,
      multiLanguageLearners30d: 0,
    });
    // Studied languages rank above set-up-only ones however popular the latter.
    expect(stats.languages.targets).toEqual([
      { language: 'en', learners: 2, learners30d: 2, reviews: 22, selectedBy: 9 },
      { language: 'de', learners: 1, learners30d: 0, reviews: 2, selectedBy: 0 },
      { language: 'es', learners: 0, learners30d: 0, reviews: 0, selectedBy: 3 },
    ]);
    expect(stats.languages.pairs[0]).toEqual({
      languageFrom: 'cs',
      languageTo: 'en',
      learners: 2,
      learners30d: 2,
      reviews: 17,
      selectedBy: 9,
    });
    expect(stats.users[0].studiedLanguages).toEqual([
      { language: 'en', reviews: 15 },
      { language: 'de', reviews: 2 },
    ]);
    expect(stats.users[0]).toMatchObject({
      selectedLanguageFrom: 'cs',
      selectedLanguageTo: 'en',
    });
  });

  it('measures goals against the prorated weekly promise, not the calendar', async () => {
    const four = '11111111-1111-1111-1111-111111111111';
    const seven = '22222222-2222-2222-2222-222222222222';
    const off = '33333333-3333-3333-3333-333333333333';
    mockAllQueries({
      goals: [
        {
          user_id: four,
          enabled: true,
          goal_mode: 'minutes',
          goal_preset: 'medium',
          goal_days_per_week: 4,
          goal_minutes_per_day: 10,
          goal_new_words_per_day: null,
          effective_from_day: '2026-07-01',
          // 28 tracked days at 4/7 of a day each = 16 promised days.
          eligible_days: 28,
          met_days: 16,
          expected_days: 16,
          last_met_day: '2026-07-14',
        },
        {
          user_id: seven,
          enabled: true,
          goal_mode: 'words',
          goal_preset: 'custom',
          goal_days_per_week: 7,
          goal_minutes_per_day: null,
          goal_new_words_per_day: 5,
          effective_from_day: '2026-07-05',
          eligible_days: 10,
          met_days: 2,
          expected_days: 10,
          last_met_day: '2026-07-06',
        },
        {
          // Set a goal, then switched it off: reported, but not a promise.
          user_id: off,
          enabled: false,
          goal_mode: 'minutes',
          goal_preset: 'light',
          goal_days_per_week: 2,
          goal_minutes_per_day: 5,
          goal_new_words_per_day: null,
          effective_from_day: '2026-06-01',
          eligible_days: 0,
          met_days: 0,
          expected_days: 0,
          last_met_day: null,
        },
      ],
      users: [{ id: four, email: 'a@example.com', first_seen_at: '2026-07-01T00:00:00.000Z' }],
    });

    const stats = await getUsageStats();

    expect(stats.goals).toMatchObject({
      enabled: 2,
      disabled: 1,
      minutesMode: 1,
      wordsMode: 1,
      metDays30d: 18,
      expectedDays30d: 26,
      trackedLearners30d: 2,
      untrackedLearners30d: 0,
    });
    // Studying every promised day is 100 %, even though it was 28 calendar days.
    expect(stats.goals.adherence).toEqual([
      { bucket: 'full', learners: 1 },
      { bucket: 'high', learners: 0 },
      { bucket: 'mid', learners: 0 },
      { bucket: 'low', learners: 1 },
      { bucket: 'none', learners: 0 },
    ]);
    expect(stats.goals.daysPerWeek).toEqual([
      { key: '4', users: 1 },
      { key: '7', users: 1 },
    ]);
    expect(stats.goals.dailyTarget).toEqual([
      { key: 'minutes:10', users: 1 },
      { key: 'words:5', users: 1 },
    ]);
    expect(stats.users[0].goal).toEqual({
      enabled: true,
      mode: 'minutes',
      preset: 'medium',
      daysPerWeek: 4,
      minutesPerDay: 10,
      newWordsPerDay: null,
      effectiveFromDay: '2026-07-01',
    });
    expect(stats.users[0].goalProgress30d).toEqual({
      eligibleDays: 28,
      metDays: 16,
      expectedDays: 16,
      lastMetDay: '2026-07-14',
    });
  });

  it('leaves a user without a goal null rather than inventing an empty one', async () => {
    mockAllQueries({
      users: [{ id: '11111111-1111-1111-1111-111111111111', email: 'a@example.com', first_seen_at: '2026-07-01T00:00:00.000Z' }],
    });

    const stats = await getUsageStats();

    expect(stats.users[0].goal).toBeNull();
    expect(stats.users[0].goalProgress30d).toEqual({
      eligibleDays: 0,
      metDays: 0,
      expectedDays: 0,
      lastMetDay: null,
    });
    expect(stats.goals.enabled).toBe(0);
  });

  it('counts a day in the app with no answered card as an active day', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    mockAllQueries({
      users: [{ id, email: 'a@example.com', first_seen_at: '2026-07-01T00:00:00.000Z', active_days: 1 }],
      userDaily: [{ user_id: id, day: '2026-07-02', reviews: 3 }],
      userPresenceDays: [
        { user_id: id, day: '2026-07-02', active_seconds: 300 },
        { user_id: id, day: '2026-07-03', active_seconds: 90 },
      ],
      userActiveDays: [{ user_id: id, active_days: 2 }],
    });

    const stats = await getUsageStats();

    expect(stats.users[0].activeDays).toBe(2);
    expect(stats.users[0].dailyActivity).toEqual([
      { date: '2026-07-02', count: 3, activeSeconds: 300 },
      { date: '2026-07-03', count: 0, activeSeconds: 90 },
    ]);
  });

  it('falls back to the review-only active-day count when segments are unavailable', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    mockAllQueries({
      users: [{ id, email: 'a@example.com', first_seen_at: '2026-07-01T00:00:00.000Z', active_days: 4 }],
      userPresenceDays: [],
      userActiveDays: [],
    });

    const stats = await getUsageStats();

    expect(stats.users[0].activeDays).toBe(4);
  });

  it('maps measured activity onto user rows and the app-wide panel', async () => {
    const userId = '22222222-2222-2222-2222-222222222222';
    mockAllQueries({
      users: [
        {
          id: userId,
          email: 'b@example.com',
          first_seen_at: '2026-07-01T00:00:00.000Z',
          registered_at: '2026-07-02T00:00:00.000Z',
          last_seen_at: null,
          last_device_platform: 'ios',
          last_device_form_factor: 'mobile',
          device_count: 1,
          game_score: 0,
          review_count: 5,
          active_days: 2,
          study_sessions: 2,
          est_active_study_seconds: 300,
          photo_analyses: 0,
        },
      ],
      activitySessions: [
        {
          active_seconds: 7200,
          sessions: 12,
          users_with_activity: 4,
          median_session_seconds: 480,
        },
      ],
      activityBySurface: [
        { surface: 'study', active_seconds: 5400, sessions: 9 },
        { surface: 'lists', active_seconds: 1800, sessions: 4 },
      ],
      userActivity: [
        {
          user_id: userId,
          active_seconds: 1500,
          sessions: 3,
          median_session_seconds: 420,
        },
      ],
    });

    const stats = await getUsageStats();

    expect(stats.users[0]).toMatchObject({
      activeSeconds30d: 1500,
      sessions30d: 3,
      medianSessionSeconds: 420,
      // The inferred estimate stays alongside the measured figure so the two
      // can be compared during the overlap period.
      estActiveStudySeconds: 300,
    });
    expect(stats.activity30d).toMatchObject({
      activeSeconds: 7200,
      sessions: 12,
      usersWithActivity: 4,
      medianSessionSeconds: 480,
    });
    expect(stats.activity30d.bySurface).toEqual([
      { surface: 'study', activeSeconds: 5400, sessions: 9 },
      { surface: 'lists', activeSeconds: 1800, sessions: 4 },
    ]);
  });

  it('leaves measured activity at zero when the table is unavailable', async () => {
    // Migration 0061 is applied by hand, so a deploy can run ahead of its table.
    // The dashboard must degrade to an empty panel, not a 500.
    mockAllQueries({ activityFails: true });

    const stats = await getUsageStats();

    expect(stats.activity30d).toMatchObject({
      activeSeconds: 0,
      sessions: 0,
      usersWithActivity: 0,
      bySurface: [],
    });
  });

  it('maps the app-wide activity heatmap and leaves it empty when there is no data', async () => {
    mockAllQueries({
      activityHeatmap: [
        { day: '2026-07-01', active_users: 4 },
        { day: '2026-07-02', active_users: 7 },
      ],
    });

    const stats = await getUsageStats();

    expect(stats.activityHeatmap).toEqual([
      { date: '2026-07-01', activeUsers: 4 },
      { date: '2026-07-02', activeUsers: 7 },
    ]);

    mockExecute.mockReset();
    mockAllQueries();
    const empty = await getUsageStats();
    expect(empty.activityHeatmap).toEqual([]);
  });
});

/**
 * Splits a drizzle `sql` template into its literal text and its bound values,
 * so a test can assert what a query filters on without pinning its exact
 * wording. Nested fragments (the shared exclusion condition is one) are walked.
 */
function describeQuery(query: unknown): { text: string; values: unknown[] } {
  const text: string[] = [];
  const values: unknown[] = [];

  const walk = (node: unknown): void => {
    const chunks = (node as { queryChunks?: unknown[] })?.queryChunks;
    if (!Array.isArray(chunks)) return;
    for (const chunk of chunks) {
      if (chunk && typeof chunk === 'object') {
        if (Array.isArray((chunk as { queryChunks?: unknown[] }).queryChunks)) {
          walk(chunk);
          continue;
        }
        // A literal chunk holds its SQL as an array of strings; a parameter
        // object holds the value it binds.
        const literal = (chunk as { value?: unknown }).value;
        if (Array.isArray(literal)) {
          text.push(literal.join(''));
          continue;
        }
        values.push(literal);
        continue;
      }
      // Interpolated primitives are bound values.
      values.push(chunk);
    }
  };

  walk(query);
  // Collapsed so an assertion does not depend on the template's indentation.
  return { text: text.join(' ').replace(/\s+/g, ' '), values };
}

describe('estimated study time', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('measures gaps inside a session, never across two of them', async () => {
    mockAllQueries();

    await getUsageStats();

    const sessionQuery = mockExecute.mock.calls
      .map((call) => describeQuery(call[0]))
      .find((query) => query.text.includes('session_marked'));

    expect(sessionQuery).toBeDefined();
    // Leading across the whole user partition charges every session boundary
    // the full inactivity cap, so a user with many sessions collects hours that
    // nobody spent.
    expect(sessionQuery?.text).toContain(
      'lead(answered_at) OVER ( PARTITION BY user_id, session_no ORDER BY answered_at )',
    );
  });
});

describe('goal adherence query', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds the denominator from calendar days rather than sparse day snapshots', async () => {
    mockAllQueries();

    await getUsageStats();

    const goalQuery = mockExecute.mock.calls
      .map((call) => describeQuery(call[0]))
      .find((query) => query.text.includes('versioned_days'));

    expect(goalQuery?.text).toContain('generate_series');
    expect(goalQuery?.text).toContain('LEFT JOIN user_day_stats');
    expect(goalQuery?.text).toContain("goal_status = 'nothing_due'");
    expect(goalQuery?.text).not.toContain(
      "count(*) FILTER (WHERE d.snapshot_created_at IS NOT NULL AND d.goal_status = 'active'",
    );
  });
});

describe('test-account exclusions', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies them to the app-wide activity panel too', async () => {
    mockAllQueries();

    await getUsageStats({
      excludedUserIds: [],
      excludedUserEmails: ['Team@example.com'],
    });

    const activityQueries = mockExecute.mock.calls
      .map((call) => describeQuery(call[0]))
      .filter((query) => query.text.includes('activity_segments'));

    // The session rollup and the surface breakdown; the per-user rollup is
    // already restricted to the user list, which is filtered upstream.
    expect(activityQueries.length).toBeGreaterThanOrEqual(2);
    for (const query of activityQueries) {
      const restricted =
        query.text.includes('JOIN users') || query.text.includes('ANY(');
      expect(restricted).toBe(true);
    }
    const joined = activityQueries.filter((query) => query.text.includes('JOIN users'));
    expect(joined).toHaveLength(2);
    for (const query of joined) {
      // Panels that skip the exclusions report a different population than the
      // per-user table right beneath them.
      expect(query.values).toContain('team@example.com');
    }
  });
});
