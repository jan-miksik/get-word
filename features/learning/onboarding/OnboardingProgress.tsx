'use client';

import { useI18n } from '@/components/I18nProvider';
import { StepDots } from '@/features/shared/onboarding/StepDots';
import { useOnboardingProgressNavigation } from './OnboardingProgressNavigation';

/**
 * The five screens a new learner walks through, in order. The word chat is one
 * step however many turns it takes: its own internal stages are a conversation,
 * not progress through onboarding.
 */
const ONBOARDING_PROGRESS_STEPS = ['language', 'level', 'goal', 'reminder', 'words'] as const;

export type OnboardingProgressStep = (typeof ONBOARDING_PROGRESS_STEPS)[number];

function ProgressIcon({ step }: { step: OnboardingProgressStep }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 20 20',
    fill: 'none',
    'aria-hidden': true,
  } as const;

  switch (step) {
    case 'language':
      return <svg {...common}><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="M3 10h14M10 3c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7Z" stroke="currentColor" strokeWidth="1.4" /></svg>;
    case 'level':
      return <svg {...common}><path d="M4 15v-3m6 3V8m6 7V4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
    case 'goal':
      return <svg {...common}><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.8" /><circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.8" /><path d="m10 10 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case 'reminder':
      return <svg {...common}><path d="M5 13h10c-1.5-1.5-2-3.2-2-5a3 3 0 0 0-6 0c0 1.8-.5 3.5-2 5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M8.5 15.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case 'words':
      return <svg {...common}><path d="M4 5.5c2.5-.7 4.5-.2 6 1.2v9c-1.5-1.4-3.5-1.9-6-1.2v-9Zm12 0c-2.5-.7-4.5-.2-6 1.2v9c1.5-1.4 3.5-1.9 6-1.2v-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
  }
}

export function OnboardingProgress({
  step,
  className = '',
}: {
  step: OnboardingProgressStep;
  className?: string;
}) {
  const { t } = useI18n();
  const onNavigate = useOnboardingProgressNavigation();
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
        steps={ONBOARDING_PROGRESS_STEPS.map((progressStep) => {
          const name = t(`onboarding.progress.${progressStep}` as const);
          return {
            label: `${t('onboarding.back')}: ${name}`,
            icon: <ProgressIcon step={progressStep} />,
          };
        })}
        onStepSelect={onNavigate
          ? (nextPosition) => onNavigate(ONBOARDING_PROGRESS_STEPS[nextPosition - 1])
          : undefined}
      />
    </div>
  );
}
