'use client';

import { useI18n } from '@/components/I18nProvider';
import type { WizardActiveStep } from '@/features/lists/types';

interface WizardProgressBarProps {
  currentStep: WizardActiveStep;
  onGoToStep: (step: WizardActiveStep) => void;
  canJumpForward?: boolean;
  availableSteps?: WizardActiveStep[];
}

export function WizardProgressBar({
  currentStep,
  onGoToStep,
  canJumpForward = false,
  availableSteps,
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
  const availableStepSet = availableSteps ? new Set<WizardActiveStep>(availableSteps) : null;

  return (
    <div className="px-4 md:px-6 py-3 border-b border-border-subtle bg-background-elevated">
      <div className="max-w-4xl mx-auto flex items-center gap-1.5 text-sm overflow-x-auto">
        {steps.map((step, index) => {
          const isAvailable = availableStepSet ? availableStepSet.has(step.id) : true;
          const isPast = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isFuture = index > currentIndex;
          const isClickable = isAvailable && (isPast || (isFuture && canJumpForward));

          return (
            <div key={step.id} className="flex items-center gap-1.5 shrink-0">
              {index > 0 && (
                <span className="text-text-soft text-xs">→</span>
              )}
              <button
                type="button"
                disabled={!isClickable && !isCurrent}
                onClick={() => isClickable && onGoToStep(step.id)}
                className={[
                  'px-2.5 py-1 rounded-md text-xs transition-colors whitespace-nowrap',
                  isCurrent
                    ? 'bg-accent/15 text-accent font-semibold'
                    : !isAvailable
                    ? 'text-text-soft/40 cursor-default'
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
