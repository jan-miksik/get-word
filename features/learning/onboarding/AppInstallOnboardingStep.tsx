'use client';

import { useI18n } from '@/components/I18nProvider';
import { RisingLettersBackground } from '@/components/RisingLettersBackground';
import type { AppInstallPlan } from '@/lib/app-install';
import { openPWAInstallHelp } from '@/lib/pwa-install';

/**
 * The first thing a mobile-web visitor sees: the store this phone installs from.
 *
 * Deliberately skippable. Whoever is reading this is already signed in and
 * already inside the web app, so a hard stop would strand exactly the people a
 * store cannot help — a device Play does not serve, a browser that cannot open
 * the listing, or someone who simply wants to look around first. The offer is
 * remembered as answered either way, so it is asked once and not again.
 *
 * Never rendered without a plan; the parent decides that (see
 * `resolveAppInstallPlan`), which is also what keeps it off desktops and out of
 * the shipped apps.
 */
export function AppInstallOnboardingStep({
  plan,
  onSkip,
}: {
  plan: AppInstallPlan;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const storeLabel =
    plan.store?.target === 'appStore' ? t('landing.stores.appStore') : t('landing.stores.play');

  return (
    <div className="relative flex min-h-[var(--app-viewport-height,100dvh)] flex-col items-center justify-center px-5 py-10">
      <RisingLettersBackground />
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
        <h1 className="m-0 text-2xl font-bold tracking-tight text-text">
          {t('onboarding.getApp.title')}
        </h1>
        <p className="mx-0 mb-0 mt-4 text-sm leading-relaxed text-text-soft">
          {t('onboarding.getApp.body')}
        </p>

        <div className="mt-8 flex w-full flex-col items-stretch gap-3">
          {plan.store ? (
            <a
              href={plan.store.url}
              target="_blank"
              rel="noopener noreferrer"
              // The store opens in its own app or tab, so this screen stays
              // behind it. Marking the step answered on the way out means
              // coming back lands on the languages, not on this again.
              onClick={onSkip}
              className="inline-flex h-13 items-center justify-center rounded-2xl bg-accent px-6 py-4 text-base font-semibold text-bg no-underline"
            >
              {storeLabel}
            </a>
          ) : null}

          {plan.offerHomeScreen ? (
            <button
              type="button"
              onClick={() => {
                onSkip();
                openPWAInstallHelp();
              }}
              className={
                plan.store
                  ? 'inline-flex items-center justify-center rounded-2xl border border-border-subtle px-6 py-3 text-sm font-semibold text-text'
                  : 'inline-flex items-center justify-center rounded-2xl bg-accent px-6 py-4 text-base font-semibold text-bg'
              }
            >
              {t('onboarding.getApp.homeScreen')}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onSkip}
            className="mt-1 cursor-pointer border-none bg-transparent p-2 text-sm font-medium text-text-soft underline underline-offset-4"
          >
            {t('onboarding.getApp.skip')}
          </button>
        </div>
      </div>
    </div>
  );
}
