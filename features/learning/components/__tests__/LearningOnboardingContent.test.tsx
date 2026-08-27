import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/LoadingScreen', () => ({
  LoadingScreen: () => <div>loading-step</div>,
}));
vi.mock('@/features/learning/onboarding/LearningLanguageOnboarding', () => ({
  LearningLanguageOnboarding: ({
    phase,
    onComplete,
  }: {
    phase: string;
    onComplete: (from: string, to: string) => void;
  }) => (
    <button type="button" onClick={() => onComplete('cs', 'vi')}>
      {phase}-step
    </button>
  ),
}));
vi.mock('@/features/learning/onboarding/LanguageLevelOnboarding', () => ({
  LanguageLevelOnboarding: ({ onSubmit }: { onSubmit: (level: 'A1') => void }) => (
    <button type="button" onClick={() => onSubmit('A1')}>level-step</button>
  ),
}));
vi.mock('@/features/learning/components/goals/StudyGoalSetupCard', () => ({
  StudyGoalSetupCard: ({ onSave }: { onSave: (value: unknown) => void }) => (
    <button type="button" onClick={() => onSave({ mode: 'words' })}>goal-step</button>
  ),
}));
vi.mock('@/features/learning/onboarding/StudyReminderOnboarding', () => ({
  StudyReminderOnboarding: ({
    onComplete,
  }: {
    onComplete: (value: { enabled: boolean; localMinutes: number }) => void;
  }) => (
    <button type="button" onClick={() => onComplete({ enabled: true, localMinutes: 600 })}>
      reminder-step
    </button>
  ),
}));

import { LearningOnboardingContent } from '../LearningOnboardingContent';

function createProps() {
  return {
    isSettingUp: true,
    initialFrom: 'cs',
    initialTo: 'vi',
    forceWordChat: false,
    targetLanguage: 'vi',
    languageLevel: null,
    languageLevelSaving: false,
    goalPacing: {
      revealMode: 'press' as const,
      minigameFrequency: 'off' as const,
      fineTune: { version: 1, stages: [] },
    },
    goalSaving: false,
    editableGoal: null,
    reminderMinutes: 600,
    reminderSaving: false,
    onSignOut: vi.fn(),
    onLeaveStep: vi.fn(),
    onCompleteLanguagePair: vi.fn(async () => {}),
    onSelectList: vi.fn(),
    onSaveLanguageLevel: vi.fn(async () => {}),
    onSaveGoal: vi.fn(async () => true),
    onCompleteReminder: vi.fn(async () => true),
  };
}

describe('LearningOnboardingContent', () => {
  it.each([
    ['loading', 'loading-step'],
    ['language', 'languages-step'],
    ['level', 'level-step'],
    ['goal', 'goal-step'],
    ['reminder', 'reminder-step'],
    ['words', 'words-step'],
  ] as const)('renders the %s step', (step, label) => {
    render(<LearningOnboardingContent {...createProps()} step={step} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('advances only after the persisted goal succeeds', async () => {
    const props = createProps();
    render(<LearningOnboardingContent {...props} step="goal" />);
    fireEvent.click(screen.getByText('goal-step'));
    await waitFor(() => expect(props.onLeaveStep).toHaveBeenCalledOnce());
  });

  it('marks the words handoff for a full study snapshot refresh', () => {
    const props = createProps();
    render(<LearningOnboardingContent {...props} step="words" />);
    fireEvent.click(screen.getByText('words-step'));
    expect(props.onCompleteLanguagePair).toHaveBeenCalledWith(
      'cs',
      'vi',
      { refreshStudySnapshot: true },
    );
  });
});
