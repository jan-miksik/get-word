'use client';

import { useI18n } from '@/components/I18nProvider';
import { formatDurationEstimate } from '@/features/learning/onboarding/listRecommendations';
import type { GenerationStatus } from './commonListAudioGeneration';

// Full-screen progress overlay shown while a list is being created and its audio
// generated. Shared by the manual onboarding screen and the auto ("skip advanced
// setup") path so both surface real progress instead of an indefinite spinner —
// generation can run for minutes and an empty loader reads as a frozen app.
export function OnboardingGenerationOverlay({ status }: { status: GenerationStatus }) {
  const { t } = useI18n();
  return (
    <div className="onboarding-overlay fixed inset-0 z-[80] flex items-center justify-center px-4">
      <section className="onboarding-card w-full max-w-md p-6 text-center">
        <div
          className="onboarding-spinner mx-auto mb-4 h-10 w-10 animate-spin rounded-full"
          aria-hidden="true"
        />
        <h2 className="text-base font-extrabold">{status.title}</h2>
        <p className="mt-2 text-sm leading-relaxed onboarding-text-soft">{status.detail}</p>
        {status.progress ? (
          <div className="mt-4 text-left">
            <div className="h-2 overflow-hidden rounded-full bg-[color:var(--ob-border)]">
              {typeof status.progress.value === 'number' ? (
                <div
                  className="h-full rounded-full bg-[color:var(--ob-accent)] transition-[width] duration-300"
                  style={{
                    width: `${Math.max(0, Math.min(1, status.progress.value)) * 100}%`,
                  }}
                />
              ) : (
                <div className="h-full w-1/3 animate-pulse rounded-full bg-[color:var(--ob-accent)]" />
              )}
            </div>
            {status.progress.label ? (
              <p className="mt-2 text-center text-xs font-bold onboarding-text-soft">
                {status.progress.label}
              </p>
            ) : null}
          </div>
        ) : null}
        {status.estimateSeconds ? (
          <p className="mt-3 text-xs font-bold onboarding-text-soft">
            {t('onboarding.estimatedTime', {
              time: formatDurationEstimate(status.estimateSeconds),
            })}
          </p>
        ) : null}
        {status.note ? (
          <p className="onboarding-notice mt-4 rounded-md px-3 py-2 text-xs font-bold leading-relaxed">
            {status.note}
          </p>
        ) : null}
      </section>
    </div>
  );
}
