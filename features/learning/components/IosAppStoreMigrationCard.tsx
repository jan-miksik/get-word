'use client';

import { useI18n } from '@/components/I18nProvider';

type Props = {
  url: string;
  onDismiss: () => void;
};

/**
 * The one-time nudge out of the old iOS home-screen web app.
 *
 * It exists because that install is invisible to us from anywhere else: the
 * App Store build cannot see it, and the learner has no reason to suspect the
 * icon they have been tapping for months is the wrong one. Why it matters, and
 * why an installed iOS app is not treated as a finished state, is documented on
 * `resolveIosPwaMigration` in `lib/app-install`.
 *
 * Deliberately dismissible and shown once. The switch cannot be detected from
 * this side, so anything that keeps insisting would go on insisting to the
 * people who already did it.
 */
export function IosAppStoreMigrationCard({ url, onDismiss }: Props) {
  const { t } = useI18n();
  const steps = [
    t('pwa.iosMigrateStep1'),
    t('pwa.iosMigrateStep2'),
    t('pwa.iosMigrateStep3'),
  ];

  return (
    <div className="flex h-full min-h-64 items-center justify-center px-4 py-6">
      {/* Same footing as the sibling interstitial cards: rendered inside the
          study surface, where the `--ob-*` variables are undefined. */}
      <section className="w-full max-w-xl rounded-2xl p-6 text-ink-800 sm:p-8">
        <h2 className="m-0 text-center text-2xl font-black leading-tight text-ink-800">
          {t('pwa.iosMigrateCardTitle')}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-ink-500">
          {t('pwa.iosMigrateCardBody')}
        </p>
        <ol className="mx-auto mt-5 flex max-w-md list-none flex-col gap-3 p-0">
          {steps.map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-sm leading-relaxed text-ink-800">
              <span
                aria-hidden
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-black text-paper"
              >
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-4 max-w-md text-center text-xs leading-relaxed text-ink-500">
          {t('pwa.iosMigrateNote')}
        </p>
        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onDismiss}
            className="onboarding-option onboarding-option-highlight rounded-xl px-5 py-3 text-center text-base font-extrabold no-underline"
          >
            {t('pwa.iosMigrateCta')}
          </a>
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2 text-xs font-bold underline onboarding-text-soft"
          >
            {t('pwa.iosMigrateDismiss')}
          </button>
        </div>
      </section>
    </div>
  );
}
