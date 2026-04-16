'use client';

type WizardActiveStep = 'edit' | 'preview' | 'translate' | 'audio';

interface WizardProgressBarProps {
  currentStep: WizardActiveStep;
  onGoToStep: (step: WizardActiveStep) => void;
}

const STEPS: { id: WizardActiveStep; label: string }[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'preview', label: 'Preview' },
  { id: 'translate', label: 'Translate' },
  { id: 'audio', label: 'Audio' },
];

export function WizardProgressBar({ currentStep, onGoToStep }: WizardProgressBarProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="px-4 md:px-6 py-3 border-b border-border-subtle bg-background-elevated">
      <div className="max-w-4xl mx-auto flex items-center gap-1.5 text-sm">
        {STEPS.map((step, index) => {
          const isPast = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isFuture = index > currentIndex;

          return (
            <div key={step.id} className="flex items-center gap-1.5">
              {index > 0 && (
                <span className="text-text-soft text-xs">→</span>
              )}
              <button
                type="button"
                disabled={isFuture}
                onClick={() => isPast && onGoToStep(step.id)}
                className={[
                  'px-2.5 py-1 rounded-md text-xs transition-colors',
                  isCurrent
                    ? 'bg-accent/15 text-accent font-semibold'
                    : isPast
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
