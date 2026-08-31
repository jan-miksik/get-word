'use client';

import { LoadingScreen } from '@/components/LoadingScreen';
import { LearningLanguageOnboarding } from '@/features/learning/onboarding/LearningLanguageOnboarding';
import { LanguageLevelOnboarding } from '@/features/learning/onboarding/LanguageLevelOnboarding';
import { StudyReminderOnboarding } from '@/features/learning/onboarding/StudyReminderOnboarding';
import { OnboardingBackdropHost } from '@/features/learning/onboarding/OnboardingScreen';
import { StudyGoalSetupCard } from '@/features/learning/components/goals/StudyGoalSetupCard';
import type { LearningOnboardingStep } from '@/features/learning/onboarding/flow';
import type { GoalPickerValue } from '@/features/learning/components/goals/StudyGoalPicker';
import type { WordChatLanguageLevel } from '@/features/word-chat/public.client';
import {
  normalizeGoalWeekdays,
  type StudyPacing,
} from '@/packages/domain/goals/goal';

interface EditableGoal {
  mode: 'words' | 'minutes';
  daysPerWeek: number;
  weekdays: readonly number[] | null;
  minutesPerDay: number;
  newWordsPerDay: number | null;
}

interface LearningOnboardingContentProps {
  step: Exclude<LearningOnboardingStep, 'app'>;
  isSettingUp: boolean;
  initialFrom: string | null;
  initialTo: string | null;
  accountEmail?: string;
  forceWordChat: boolean;
  languageScreenExit?: () => void;
  targetLanguage: string | null;
  languageLevel: WordChatLanguageLevel | null;
  languageLevelSaving: boolean;
  goalRevision?: number;
  goalPacing: StudyPacing;
  goalSaving: boolean;
  editableGoal: EditableGoal | null;
  reminderMinutes: number;
  reminderSaving: boolean;
  onSignOut: () => void | Promise<void>;
  onBack?: () => void;
  onLeaveStep: () => void;
  onCompleteLanguagePair: (
    from: string,
    to: string,
    options?: { refreshStudySnapshot?: boolean },
  ) => Promise<void>;
  onSelectList: (listId: string) => void;
  onSaveLanguageLevel: (level: WordChatLanguageLevel) => Promise<void>;
  onSaveGoal: (value: GoalPickerValue) => Promise<boolean>;
  onCompleteReminder: (value: { enabled: boolean; localMinutes: number }) => Promise<boolean>;
}

/**
 * Render-only half of the resumable learning onboarding flow.
 *
 * Owns two things the individual steps cannot own: the backdrop, hosted once
 * here so the ground stays put while the steps change over it, and the step
 * key, which makes each step a fresh mount even where two steps happen to be
 * the same component (languages and words) — without it that one pair would
 * swap contents in place, with no entrance to play.
 */
export function LearningOnboardingContent(props: LearningOnboardingContentProps) {
  if (props.step === 'loading') return <LoadingScreen />;
  return (
    <OnboardingBackdropHost>
      <LearningOnboardingStep key={props.step} {...props} />
    </OnboardingBackdropHost>
  );
}

function LearningOnboardingStep({
  step,
  isSettingUp,
  initialFrom,
  initialTo,
  accountEmail,
  forceWordChat,
  languageScreenExit,
  targetLanguage,
  languageLevel,
  languageLevelSaving,
  goalRevision,
  goalPacing,
  goalSaving,
  editableGoal,
  reminderMinutes,
  reminderSaving,
  onSignOut,
  onBack,
  onLeaveStep,
  onCompleteLanguagePair,
  onSelectList,
  onSaveLanguageLevel,
  onSaveGoal,
  onCompleteReminder,
}: LearningOnboardingContentProps) {
  if (step === 'language') {
    return (
      <LearningLanguageOnboarding
        phase="languages"
        showProgress={isSettingUp}
        initialFrom={initialFrom}
        initialTo={initialTo}
        accountEmail={accountEmail}
        onSignOut={onSignOut}
        autoOpenWordChat={forceWordChat}
        onExit={languageScreenExit}
        onBack={languageScreenExit}
        onComplete={onCompleteLanguagePair}
        onSelectList={onSelectList}
      />
    );
  }

  if (step === 'level') {
    return (
      <LanguageLevelOnboarding
        targetLanguage={targetLanguage}
        initialLevel={languageLevel}
        pending={languageLevelSaving}
        onBack={onBack}
        onSubmit={(level) => {
          onLeaveStep();
          void onSaveLanguageLevel(level);
        }}
      />
    );
  }

  if (step === 'goal') {
    return (
      <StudyGoalSetupCard
        key={`goal-${goalRevision ?? 'new'}`}
        pacing={goalPacing}
        pending={goalSaving}
        showProgress={isSettingUp}
        initial={editableGoal ? {
          mode: editableGoal.mode,
          daysPerWeek: editableGoal.daysPerWeek,
          weekdays: normalizeGoalWeekdays(editableGoal.weekdays) ?? undefined,
          minutesPerDay: editableGoal.minutesPerDay,
          newWordsPerDay: editableGoal.newWordsPerDay ?? 5,
        } : undefined}
        onBack={onBack}
        onSave={(value) => {
          void onSaveGoal(value).then((saved) => {
            if (saved) onLeaveStep();
          });
        }}
      />
    );
  }

  if (step === 'reminder') {
    return (
      <StudyReminderOnboarding
        initialMinutes={reminderMinutes}
        pending={reminderSaving}
        showProgress={isSettingUp}
        onBack={onBack}
        onComplete={(value) => {
          void onCompleteReminder(value).then((saved) => {
            if (saved) onLeaveStep();
          });
        }}
      />
    );
  }

  return (
    <LearningLanguageOnboarding
      phase="words"
      showProgress
      autoOpenWordChat
      initialFrom={initialFrom}
      initialTo={initialTo}
      accountEmail={accountEmail}
      onSignOut={onSignOut}
      onBack={onBack}
      onExit={onBack}
      onComplete={(from, to) => onCompleteLanguagePair(
        from,
        to,
        { refreshStudySnapshot: true },
      )}
      onSelectList={onSelectList}
    />
  );
}
