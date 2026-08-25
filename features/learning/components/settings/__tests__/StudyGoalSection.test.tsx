import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudyGoalSection } from '../StudyGoalSection';
import { DEFAULT_FINE_TUNE_CONFIG } from '@/features/learning/fine-tune/config';

vi.mock('@/context/AppStateContext', () => ({
  useAppStateContext: () => ({
    revealMode: 'press',
    learningFineTune: DEFAULT_FINE_TUNE_CONFIG,
    userId: 'learner-1',
  }),
}));

type SyncPayload = { study_goal?: Record<string, unknown> };
const syncUserData = vi.fn<(payload: SyncPayload, options?: unknown) => Promise<void>>(async () => {});
vi.mock('@/lib/sync', () => ({
  syncUserData: (payload: SyncPayload, options?: unknown) => syncUserData(payload, options),
}));

/** The `study_goal` block of the one mutation the section is expected to send. */
function savedGoal(): Record<string, unknown> {
  expect(syncUserData).toHaveBeenCalledTimes(1);
  const goal = syncUserData.mock.calls[0]?.[0].study_goal;
  expect(goal).toBeDefined();
  return goal!;
}

vi.mock('@/features/learning/goals/web-push', () => ({
  reminderPermissionEnablesReminders: (result: string) => result === 'granted',
  requestStudyReminderPermission: vi.fn(async () => 'granted'),
  unsubscribeFromStudyWebPush: vi.fn(async () => undefined),
}));

let summary: unknown = null;
const refresh = vi.fn(async () => undefined);
vi.mock('@/features/learning/goals/useGoalSummary', () => ({
  useGoalSummary: () => ({ summary, refresh }),
}));

const version = (overrides: Record<string, unknown> = {}) => ({
  effectiveFromDay: '2026-08-01',
  enabled: true,
  mode: 'words' as const,
  daysPerWeek: 3,
  weekdays: [1, 3, 5],
  minutesPerDay: 12,
  wordsPerDay: 24,
  newWordsPerDay: 7,
  preset: 'custom' as const,
  pacing: { revealMode: 'press', minigameFrequency: { min: 2, max: 3 }, fineTune: DEFAULT_FINE_TUNE_CONFIG },
  createdAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

const summaryWith = (active: unknown, pending: unknown = null) => ({
  today: '2026-08-22',
  timezone: 'Europe/Prague',
  goal: { active, pending, revision: 4 },
  reminder: { enabled: false, localMinutes: 19 * 60, onboardingAnswered: true },
  days: [],
  streakWeeks: 0,
  weeklyAdherenceStreak: 0,
  dailyStreakDays: 0,
  streakWeeksAtWindowStart: 0,
  graceCooldownRemainingAtWindowStart: 0,
});

beforeEach(() => {
  syncUserData.mockClear();
  summary = summaryWith(version());
});

const props = { minigameFrequency: { min: 2, max: 3 } as const };

describe('StudyGoalSection', () => {
  const goalSwitch = () => screen.getByRole('switch', { name: /enable study goal/i });

  it('shows the goal as on and offers the picker', () => {
    render(<StudyGoalSection {...props} />);

    expect(goalSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('slider', { name: /new words/i })).toBeInTheDocument();
  });

  // The switch is the only way to stop a goal, so it has to write `enabled:
  // false` while leaving the shape alone — otherwise turning it back on would
  // hand the learner a default rhythm instead of the one they had.
  it('turns the goal off without changing its shape', async () => {
    const user = userEvent.setup();
    render(<StudyGoalSection {...props} />);

    await user.click(goalSwitch());

    await waitFor(() => expect(syncUserData).toHaveBeenCalled());
    expect(savedGoal()).toMatchObject({
      enabled: false,
      mode: 'words',
      goal_new_words_per_day: 7,
      goal_days_per_week: 3,
      goal_weekdays: [1, 3, 5],
    });
  });

  it('hides the picker while the goal is off and can switch it back on', async () => {
    summary = summaryWith(version({ enabled: false }));
    const user = userEvent.setup();
    render(<StudyGoalSection {...props} />);

    expect(goalSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('slider', { name: /new words/i })).not.toBeInTheDocument();

    await user.click(goalSwitch());

    await waitFor(() => expect(syncUserData).toHaveBeenCalled());
    expect(savedGoal()).toMatchObject({ enabled: true, goal_new_words_per_day: 7 });
  });

  // A version written before weekdays existed carries only a count, and the
  // stored shape now requires the two to agree.
  it('fills in weekdays for a legacy goal that has only a count', async () => {
    summary = summaryWith(version({ weekdays: null, daysPerWeek: 4 }));
    const user = userEvent.setup();
    render(<StudyGoalSection {...props} />);

    await user.click(goalSwitch());

    await waitFor(() => expect(syncUserData).toHaveBeenCalled());
    const goal = savedGoal();
    expect(goal.goal_weekdays).toHaveLength(4);
    expect(goal.goal_days_per_week).toBe(4);
  });

  // The picker snapshots `initial` on mount and the summary arrives one fetch
  // later, so without a key tied to it the panel keeps showing the default goal
  // — and saving writes that default over the learner's real one.
  it('adopts the stored goal once the summary arrives', async () => {
    summary = null;
    const { rerender } = render(<StudyGoalSection {...props} />);
    expect(screen.queryByRole('slider', { name: /new words/i })).not.toBeInTheDocument();

    summary = summaryWith(version({ newWordsPerDay: 23 }));
    rerender(<StudyGoalSection {...props} />);

    await waitFor(() =>
      expect(screen.getByRole('slider', { name: /new words/i })).toHaveAttribute('aria-valuetext', expect.stringContaining('23')),
    );
  });
});
