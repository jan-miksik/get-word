'use client';

import { useI18n } from '@/components/I18nProvider';
import type { StudyPacing } from '@/packages/domain/goals/goal';
import { StudyGoalPicker } from './StudyGoalPicker';
import type { GoalPickerValue } from './StudyGoalPicker';
import { StudyGoalIcon } from './StudyGoalIcon';
import {
  OnboardingBody,
  OnboardingScreen,
  OnboardingTitle,
} from '@/features/learning/onboarding/OnboardingScreen';
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
  onBack,
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
  /** Back to the previous setup step. Never set in the settings panel. */
  onBack?: () => void;
}) {
  const { t } = useI18n();
  // The goal step carries the tallest control in the flow, so on a phone-sized
  // window its decoration is what gives way first: the title tightens on a tall
  // phone and again on a short one (iPhone SE). The flag itself stays — it
  // shrinks with the rest of the step icons and still fits above the dial. The
  // ranges are closed for the same reason as in the picker: two open
  // `max-height` variants of one property would leave the winner to Tailwind's
  // sort order.
  const heading = (
    <>
      <StudyGoalIcon />
      <OnboardingTitle className="mb-5 mt-3 [@media(min-height:721px)_and_(max-height:900px)]:mb-3 [@media(min-height:721px)_and_(max-height:900px)]:mt-1 [@media(max-height:720px)]:mb-3 [@media(max-height:720px)]:mt-0 max-sm:[@media(max-height:720px)]:text-2xl">
        {title ?? t('goal.setupTitle')}
      </OnboardingTitle>
      {body ? (
        <OnboardingBody className="mx-auto mb-5 -mt-2 max-w-xl">{body}</OnboardingBody>
      ) : null}
    </>
  );

  // Inside the settings panel this is a section of a longer page, not a screen:
  // no background, no sheet, no progress — and the picker keeps its own frame
  // because there is none around it there.
  if (compact) {
    return (
      <div style={warmPaletteVars} className="w-full px-4 py-2 text-center text-[color:var(--ob-ink)]">
        {heading}
        <StudyGoalPicker
          pacing={pacing}
          initial={initial}
          onSubmit={onSave}
          pending={pending}
          framed
          submitLabel={submitLabel ?? t('goal.setupSubmit')}
        />
      </div>
    );
  }

  return (
    <OnboardingScreen
      step={showProgress ? 'goal' : null}
      onBack={onBack}
      width="wide"
      contentClassName="text-center"
    >
      {heading}
      <StudyGoalPicker
        pacing={pacing}
        initial={initial}
        onSubmit={onSave}
        pending={pending}
        submitLabel={submitLabel ?? t('goal.setupSubmit')}
      />
    </OnboardingScreen>
  );
}
