'use client';

import { useI18n } from '@/components/I18nProvider';
import { StepDots } from '@/features/shared/onboarding/StepDots';

/**
 * The five screens a new learner walks through, in order. The word chat is one
 * step however many turns it takes: its own internal stages are a conversation,
 * not progress through onboarding.
 */
const ONBOARDING_PROGRESS_STEPS = ['language', 'level', 'goal', 'reminder', 'words'] as const;

export type OnboardingProgressStep = (typeof ONBOARDING_PROGRESS_STEPS)[number];

export function OnboardingProgress({
  step,
  className = '',
}: {
  step: OnboardingProgressStep;
  className?: string;
}) {
  const { t } = useI18n();
  const index = ONBOARDING_PROGRESS_STEPS.indexOf(step);
  const position = index + 1;
  const total = ONBOARDING_PROGRESS_STEPS.length;

  return (
    // Spacing around the rail belongs to `OnboardingScreen`, which gives it a
    // row of its own — a margin owned here would fight that row.
    <div className={className}>
      {/* No caption line: "Step 2 of 5" spelled out under the rail told the
          learner nothing the filled segments do not, and it turned five short
          screens into five screens with a header. The wording survives as the
          rail's accessible value text. */}
      <StepDots
        compact
        total={total}
        current={position}
        label={t('onboarding.progressLabel')}
        caption={t('onboarding.progressStep', { step: position, total })}
      />
    </div>
  );
}
