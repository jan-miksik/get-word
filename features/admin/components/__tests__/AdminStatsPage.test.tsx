import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminUserRow, UsageStats } from '@/features/admin/types';

const apiFetch = vi.fn();

vi.mock('@/features/shared/http/api-runtime', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

vi.mock('@/features/shared/languages/useSettingsLanguage', () => ({
  useSettingsLanguage: () => 'en',
}));

import { AdminStatsPage } from '../AdminStatsPage';

function user(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    handle: 'user_000000000001',
    email: 'a@example.com',
    firstSeenAt: '2026-07-01T00:00:00.000Z',
    registeredAt: '2026-07-01T00:00:00.000Z',
    lastSeenAt: '2026-07-10T00:00:00.000Z',
    lastDevicePlatform: 'ios',
    lastDeviceFormFactor: 'mobile',
    deviceCount: 1,
    gameScore: 0,
    reviewCount: 10,
    activeDays: 4,
    studySessions: 2,
    estActiveStudySeconds: 600,
    activeSeconds30d: 300,
    sessions30d: 2,
    medianSessionSeconds: 150,
    photoAnalyses: 0,
    selectedLanguageFrom: 'cs',
    selectedLanguageTo: 'en',
    studiedLanguages: [{ language: 'en', reviews: 10 }],
    goal: {
      enabled: true,
      mode: 'minutes',
      preset: 'medium',
      daysPerWeek: 4,
      minutesPerDay: 10,
      newWordsPerDay: null,
      effectiveFromDay: '2026-07-01',
    },
    goalProgress30d: { eligibleDays: 8, metDays: 6, expectedDays: 8, lastMetDay: '2026-07-14' },
    dailyActivity: [],
    ...overrides,
  };
}

function stats(overrides: Partial<UsageStats> = {}): UsageStats {
  return {
    generatedAt: '2026-07-15T12:00:00.000Z',
    registrations: { total: 10, email: 4, google: 3, apple: 2, other: 1, anonymous: 5, weekly: [] },
    activity: {
      window: 'rolling',
      dau: 1, wau: 2, mau: 3, yau: 4,
      mauRegistered: 2, mauAnonymous: 1, yauRegistered: 3, yauAnonymous: 1,
    },
    devices: {
      activeDevices30d: 1, knownDevices30d: 1, iosUsers30d: 1, androidUsers30d: 0,
      mobileUsers30d: 1, desktopUsers30d: 0, multiDeviceUsers30d: 0,
      platformBreakdown30d: [], formFactorBreakdown30d: [],
    },
    study: { known30d: 1, reallyKnown30d: 1, unknown30d: 1, studyingUsers30d: 1, weekly: [] },
    activity30d: { activeSeconds: 0, sessions: 0, usersWithActivity: 0, medianSessionSeconds: 0, bySurface: [] },
    languages: {
      learners: 4,
      learners30d: 2,
      multiLanguageLearners: 1,
      multiLanguageLearners30d: 0,
      targets: [
        { language: 'en', learners: 3, learners30d: 2, reviews: 30, selectedBy: 5 },
        { language: 'vi', learners: 1, learners30d: 0, reviews: 4, selectedBy: 1 },
        { language: 'es', learners: 0, learners30d: 0, reviews: 0, selectedBy: 2 },
      ],
      pairs: [{ languageFrom: 'cs', languageTo: 'en', learners: 3, learners30d: 2, reviews: 30, selectedBy: 5 }],
    },
    goals: {
      enabled: 6,
      disabled: 1,
      minutesMode: 4,
      wordsMode: 2,
      metDays30d: 30,
      expectedDays30d: 50,
      eligibleDays30d: 60,
      trackedLearners30d: 5,
      untrackedLearners30d: 1,
      adherence: [
        { bucket: 'full', learners: 2 },
        { bucket: 'high', learners: 1 },
        { bucket: 'mid', learners: 1 },
        { bucket: 'low', learners: 0 },
        { bucket: 'none', learners: 1 },
      ],
      daysPerWeek: [
        { key: '4', users: 4 },
        { key: '7', users: 2 },
      ],
      dailyTarget: [
        { key: 'minutes:10', users: 4 },
        { key: 'words:5', users: 2 },
      ],
      presets: [
        { key: 'medium', users: 4 },
        { key: 'custom', users: 2 },
      ],
    },
    content: { totalLists: 1, publicLists: 1, totalSubscriptions: 1, topLists: [] },
    retention: {
      d1: { eligible: 1, returned: 1 },
      d7: { eligible: 1, returned: 0 },
      d30: { eligible: 1, returned: 0 },
    },
    photo: {
      totalAnalyses: 0, users: 0, repeatUsers: 0, repeatRate: 0,
      trackedSince: '2026-07-01T00:00:00.000Z', firstEventAt: null, weekly: [],
    },
    wordChat: {
      monthStart: '2026-07-01T00:00:00.000Z', monthlyLimitUsd: 10,
      calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, accounts: [],
    },
    googleApi: {
      monthStart: '2026-07-01T00:00:00.000Z',
      translateFreeUnits: 500000, ttsFreeUnits: 1000000,
      translateUnits: 0, ttsUnits: 0, requests: 0, estimatedTranslationCostUsd: 0,
      sources: Array.from({ length: 7 }, (_, index) => ({
        scope: 'tts' as const,
        source: `source_${index}`,
        model: `model_${index}`,
        units: 100 - index,
        requests: 1,
      })),
    },
    uiLanguageRequests: { totalRequests: 0, languages: [] },
    activityHeatmap: [],
    users: [user()],
    ...overrides,
  };
}

function mockStats(payload: UsageStats) {
  apiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  });
}

describe('AdminStatsPage', () => {
  it('reports Apple alongside the other sign-in providers', async () => {
    mockStats(stats());
    render(<AdminStatsPage />);

    const apple = await screen.findByText('Apple');
    expect(apple.parentElement?.textContent).toContain('2');
  });

  it('shows only the five biggest Google API rows until asked for the rest', async () => {
    mockStats(stats());
    render(<AdminStatsPage />);

    expect(await screen.findByText('model_4')).toBeTruthy();
    expect(screen.queryByText('model_5')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Show all 7 rows' }));

    expect(screen.getByText('model_6')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Show top 5 only' }));
    expect(screen.queryByText('model_5')).toBeNull();
  });

  it('ranks target languages and separates studying from merely set up', async () => {
    mockStats(stats());
    render(<AdminStatsPage />);

    await screen.findByText('Languages being learned');
    expect(screen.getByText('Two or more languages').parentElement?.textContent).toContain('1');

    const spanishRow = screen.getByText('Spanish').closest('tr');
    expect(spanishRow).toBeTruthy();
    // Nobody studies Spanish; it is on the list only because two accounts set it up.
    const cells = within(spanishRow as HTMLElement).getAllByRole('cell');
    expect(cells.map((cell) => cell.textContent?.trim())).toEqual(['🇪🇸Spanishes', '0', '0', '2', '0']);
  });

  it('summarises goals as kept days against the prorated weekly promise', async () => {
    mockStats(stats());
    render(<AdminStatsPage />);

    await screen.findByText('Study goals');
    // 30 met days out of 50 promised.
    expect(screen.getByText('Promise kept (30 d)').parentElement?.textContent).toContain('60%');
    expect(screen.getByText('Goal switched on').parentElement?.textContent).toContain('6');
    expect(screen.getByText('4× a week')).toBeTruthy();
    expect(screen.getByText('5 words/day')).toBeTruthy();

    // Per-user: 6 of 8 promised days.
    expect(screen.getByText('6 / 8')).toBeTruthy();
    expect(screen.getByText('10 min/day · 4× a week')).toBeTruthy();
  });

  it('lets the reader hide a column of the user table', async () => {
    mockStats(stats());
    render(<AdminStatsPage />);

    await screen.findByText('user_000000000001');
    expect(screen.getByRole('columnheader', { name: /Photos/ })).toBeTruthy();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Photos' }));

    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Photos/ })).toBeNull());
    // The rest of the table is untouched.
    expect(screen.getByRole('columnheader', { name: /Goal$/ })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /Photos/ })).toBeTruthy());
  });

  it('filters the user table by the language actually studied', async () => {
    mockStats(
      stats({
        users: [
          user({ handle: 'user_english', studiedLanguages: [{ language: 'en', reviews: 10 }] }),
          user({
            handle: 'user_setup_only',
            email: 'b@example.com',
            studiedLanguages: [],
            selectedLanguageTo: 'en',
          }),
        ],
      })
    );
    render(<AdminStatsPage />);

    await screen.findByText('user_english');
    expect(screen.getByText('user_setup_only')).toBeTruthy();

    // The filter offers only languages someone has studied.
    const filter = screen.getByLabelText('Language') as HTMLSelectElement;
    expect(Array.from(filter.options).map((option) => option.value)).toEqual(['all', 'en', 'vi']);

    await userEvent.selectOptions(filter, 'en');

    await waitFor(() => expect(screen.queryByText('user_setup_only')).toBeNull());
    expect(screen.getByText('user_english')).toBeTruthy();
  });
});
