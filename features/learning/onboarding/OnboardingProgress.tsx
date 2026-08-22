'use client';

import { useI18n } from '@/components/I18nProvider';

/**
 * The five screens a new learner walks through, in order. The word chat is one
 * step however many turns it takes: its own internal stages are a conversation,
 * not progress through onboarding.
 */
export const ONBOARDING_PROGRESS_STEPS = ['language', 'level', 'goal', 'reminder', 'words'] as const;

export type OnboardingProgressStep = (typeof ONBOARDING_PROGRESS_STEPS)[number];

export function OnboardingProgress({ step }: { step: OnboardingProgressStep }) {
  const { t } = useI18n();
  const index = ONBOARDING_PROGRESS_STEPS.indexOf(step);
  const position = index + 1;
  const total = ONBOARDING_PROGRESS_STEPS.length;

  return (
    <div className="mb-5 w-full">
      <div
        role="progressbar"
        aria-label={t('onboarding.progressLabel')}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={position}
        aria-valuetext={t('onboarding.progressStep', { step: position, total })}
        className="flex items-center gap-1.5"
      >
        {ONBOARDING_PROGRESS_STEPS.map((entry, entryIndex) => (
          <span
            key={entry}
            aria-hidden
            className={[
              'h-2.5 flex-1 rounded-full border-2 border-[color:var(--ob-ink,#2A2218)] transition-colors',
              entryIndex <= index
                ? 'bg-[color:var(--ob-accent,#1E6FA8)]'
                : 'bg-[color:var(--ob-surface,#F4EFE2)]',
            ].join(' ')}
          />
        ))}
      </div>
      <p className="m-0 mt-2 text-xs font-black uppercase tracking-[0.13em] text-[color:var(--ob-ink-soft,#6B5E48)]">
        {t('onboarding.progressStep', { step: position, total })}
      </p>
    </div>
  );
}
