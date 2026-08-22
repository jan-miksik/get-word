'use client';

import { useI18n } from '@/components/I18nProvider';
import type { StudyPacing } from '@/packages/domain/goals/goal';
import { StudyGoalPicker } from './StudyGoalPicker';
import type { GoalPickerValue } from './StudyGoalPicker';
import { StudyGoalIcon } from './StudyGoalIcon';
import { OnboardingProgress } from '@/features/learning/onboarding/OnboardingProgress';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';

export function StudyGoalSetupCard({
  pacing,
  onSave,
  pending,
  initial,
  title,
  body,
  submitLabel,
  compact = false,
  showProgress = false,
}: {
  pacing: StudyPacing;
  onSave: (value: GoalPickerValue) => void;
  pending?: boolean;
  initial?: Partial<GoalPickerValue>;
  title?: string;
  /** Only shown when a caller has something to say — the picker explains itself. */
  body?: string;
  submitLabel?: string;
  compact?: boolean;
  /** Shown only while this card is a step of first-time setup. */
  showProgress?: boolean;
}) {
  const { t } = useI18n();
  return (
    <main
      style={warmPaletteVars}
      className={`flex w-full items-center justify-center px-4 text-[color:var(--ob-ink)] ${compact ? 'py-2' : 'min-h-[100dvh] bg-[color:var(--ob-surface)] py-8 sm:py-12'}`}
    >
      <div className="w-full max-w-4xl text-center">
        {showProgress ? (
          <div className="mx-auto max-w-2xl">
            <OnboardingProgress step="goal" />
          </div>
        ) : null}
        <StudyGoalIcon />
        <h1 className="mb-5 mt-3 text-3xl font-black text-[color:var(--ob-ink)]">{title ?? t('goal.setupTitle')}</h1>
        {body ? (
          <p className="mx-auto mb-5 -mt-2 max-w-xl text-sm leading-relaxed text-[color:var(--ob-ink-soft)]">
            {body}
          </p>
        ) : null}
        <StudyGoalPicker
          pacing={pacing}
          initial={initial}
          onSubmit={onSave}
          pending={pending}
          submitLabel={submitLabel ?? t('goal.setupSubmit')}
        />
      </div>
    </main>
  );
}
