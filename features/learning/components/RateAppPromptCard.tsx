'use client';

import { useI18n } from '@/components/I18nProvider';

type Props = {
  rateAppUrl: string;
  onDismiss: () => void;
};

/**
 * Study-deck interstitial asking for a store rating. Deliberately even-handed:
 * it does not ask whether the learner is happy first, and the dismiss option is
 * a plain "not now" rather than a route into a private feedback form — a rating
 * request that filters for good moods is what makes store ratings worthless.
 */
export function RateAppPromptCard({ rateAppUrl, onDismiss }: Props) {
  const { t } = useI18n();

  return (
    <div className="flex h-full min-h-64 items-center justify-center px-4 py-6">
      {/* Renders inside the study surface, not `.onboarding-screen`, so the
          `--ob-*` variables are undefined here — use the warm ink palette
          directly, like the sibling interstitial cards. */}
      <section className="w-full max-w-xl rounded-2xl p-6 text-center text-[#1f1a12] sm:p-8">
        <h2 className="m-0 text-2xl font-black leading-tight text-[#1f1a12]">
          {t('rateApp.promptTitle')}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#4a4032]">
          {t('rateApp.promptBody')}
        </p>
        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2">
          <a
            href={rateAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onDismiss}
            className="onboarding-option onboarding-option-highlight rounded-xl px-5 py-3 text-base font-extrabold no-underline"
          >
            {t('rateApp.promptAction')}
          </a>
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2 text-xs font-bold underline onboarding-text-soft"
          >
            {t('rateApp.promptDismiss')}
          </button>
        </div>
      </section>
    </div>
  );
}
