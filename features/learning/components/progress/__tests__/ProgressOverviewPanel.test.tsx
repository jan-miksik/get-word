import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import type { GoalSummary } from '@/packages/contracts/src/goals';
import type { ProgressStats } from '@/lib/progress-stats';
import { ProgressOverviewPanel } from '../ProgressOverviewPanel';

const progressStats: ProgressStats = {
  total: 12, byStage: Array.from({ length: 11 }, () => 0), totalKnown: 4, totalUnknown: 1,
  readyCount: 2, fresh: 3, learning: 5, done: 4, new: 3, retired: 0,
};

type GoalDay = GoalSummary['days'][number];

function day(overrides: Partial<GoalDay> = {}): GoalDay {
  return {
    dayKey: '2026-09-01', activeMs: 0, answeredWords: 0,
    goalDaysPerWeek: 4, goalMinutes: null, goalWords: 8, goalMode: 'words',
    goalStatus: 'active', availableNewWords: 20, dueReviewCount: 4,
    resolvedNewTarget: null, resolvedReviewTarget: null,
    resolvedItemBudget: null, resolvedMinutesBudget: null,
    introducedWords: 0, reviewedWords: 0, met: false,
    preferred: false, status: 'none',
    ...overrides,
  } as GoalDay;
}

function renderPanel(goalDay: GoalDay | null) {
  return render(
    <I18nProvider language="en">
      <ProgressOverviewPanel progressStats={progressStats} goalDay={goalDay} streak={null} />
    </I18nProvider>,
  );
}

describe('ProgressOverviewPanel day goal', () => {
  it('shows the configured words goal before the day freezes its targets', () => {
    renderPanel(day());
    expect(screen.getByText(/0 \/ 8/)).toBeTruthy();
    expect(screen.queryByText(/No study goal set yet/)).toBeNull();
  });

  it('prefers the frozen targets once the first answer has planned the day', () => {
    renderPanel(day({ resolvedNewTarget: 5, resolvedReviewTarget: 4, introducedWords: 2, reviewedWords: 1 }));
    expect(screen.getByText(/3 \/ 9/)).toBeTruthy();
  });

  it('separates a day with nothing due from a missing goal', () => {
    renderPanel(day({ goalStatus: 'nothing_due', resolvedNewTarget: 0, resolvedReviewTarget: 0 }));
    expect(screen.getByText(/nothing to study today/)).toBeTruthy();
  });

  it('still reports a genuinely unset goal', () => {
    renderPanel(day({ goalMode: null, goalWords: null }));
    expect(screen.getByText(/No study goal set yet/)).toBeTruthy();
  });
});
