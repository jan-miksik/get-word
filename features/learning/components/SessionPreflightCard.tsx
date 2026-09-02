'use client';

import { useI18n } from '@/components/I18nProvider';
import type { SessionPreflight } from '@/features/learning/session/preflight';

type Props = {
  preflight: SessionPreflight;
  onAddWords: () => void;
  onStartAnyway: () => void;
};

/**
 * The offer to top up the day's words before the clock starts.
 *
 * It stands where the first card of the session would, because that is the one
 * moment when adding words costs nothing: the day has not been measured yet, so
 * the trip to the chat is free. Ten minutes later the same trip is a pause in
 * the middle of a session.
 */
export function SessionPreflightCard({ preflight, onAddWords, onStartAnyway }: Props) {
  const { t } = useI18n();

  return (
    <div className="flex h-full min-h-64 items-center justify-center px-4 py-6">
      {/* Renders inside the study surface, not `.onboarding-screen`, so the
          `--ob-*` variables are undefined here — use the warm ink palette
          directly, like the sibling interstitial cards. */}
      <section className="w-full max-w-xl rounded-2xl p-6 text-center text-ink-800 sm:p-8">
        <h2 className="m-0 text-2xl font-black leading-tight text-ink-800">
          {t('goal.preflightTitle')}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500">
          {t('goal.preflightBody', {
            planned: preflight.plannedNewWords,
            available: preflight.availableNewWords,
            missing: preflight.missingNewWords,
          })}
        </p>
        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2">
          <button
            type="button"
            onClick={onAddWords}
            className="onboarding-option onboarding-option-highlight rounded-xl px-5 py-3 text-base font-extrabold"
          >
            {t('goal.preflightAction', { missing: preflight.missingNewWords })}
          </button>
          <button
            type="button"
            onClick={onStartAnyway}
            className="px-4 py-2 text-xs font-bold underline onboarding-text-soft"
          >
            {t('goal.preflightSkip')}
          </button>
        </div>
      </section>
    </div>
  );
}
