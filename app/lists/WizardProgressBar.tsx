'use client';

import { useI18n } from '@/components/I18nProvider';

export type WizardActiveStep =
  | 'edit'
  | 'preview'
  | 'translate'
  | 'audio-target'
  | 'audio-known';

interface WizardProgressBarProps {
  currentStep: WizardActiveStep;
  onGoToStep: (step: WizardActiveStep) => void;
  canJumpForward?: boolean;
}

export function WizardProgressBar({
  currentStep,
  onGoToStep,
  canJumpForward = false,
}: WizardProgressBarProps) {
  const { t } = useI18n();
  const steps: { id: WizardActiveStep; label: string }[] = [
    { id: 'edit', label: t('lists.wizardEdit') },
    { id: 'preview', label: t('lists.wizardPreview') },
    { id: 'translate', label: t('lists.wizardTranslate') },
    { id: 'audio-target', label: t('lists.wizardAudioTarget') },
    { id: 'audio-known', label: t('lists.wizardAudioKnown') },
  ];
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="px-4 md:px-6 py-3 border-b border-border-subtle bg-background-elevated">
      <div className="max-w-4xl mx-auto flex items-center gap-1.5 text-sm">
        {steps.map((step, index) => {
          const isPast = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isFuture = index > currentIndex;
          const isClickable = isPast || (isFuture && canJumpForward);

          return (
            <div key={step.id} className="flex items-center gap-1.5">
              {index > 0 && (
                <span className="text-text-soft text-xs">→</span>
              )}
              <button
                type="button"
                disabled={!isClickable && !isCurrent}
                onClick={() => isClickable && onGoToStep(step.id)}
                className={[
                  'px-2.5 py-1 rounded-md text-xs transition-colors',
                  isCurrent
                    ? 'bg-accent/15 text-accent font-semibold'
                    : isClickable
                    ? 'text-accent hover:bg-accent/10 cursor-pointer'
                    : 'text-text-soft cursor-default',
                ].join(' ')}
              >
                {isCurrent && (
                  <span className="mr-1 opacity-60">{index + 1}.</span>
                )}
                {step.label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
