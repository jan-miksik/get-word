'use client';

import {
  clearCapturedBeforeInstallPrompt,
  openPWAInstallHelp,
} from '@/lib/pwa-install';
import { useI18n } from '@/components/I18nProvider';
import {
  useAppInstallPlan,
  useCapturedInstallPrompt,
  useStandaloneStatus,
} from '@/hooks/usePWAInstallState';

const actionClass =
  'px-3 py-2 text-xs font-semibold rounded-xl border border-accent/40 bg-accent/10 text-accent cursor-pointer hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';

function Row({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm text-text">{title}</div>
        <div className="text-xs text-text-soft/70">{description}</div>
      </div>
      {action}
    </div>
  );
}

/**
 * The Settings → App row. What it offers is `lib/app-install`'s decision, so it
 * cannot drift from the top-menu entry or the intro card: a store link where
 * the device has a store, the browser's own install prompt where it does not.
 */
export function PWAInstallSection() {
  const { t } = useI18n();
  const deferredPrompt = useCapturedInstallPrompt();
  const installed = useStandaloneStatus();
  const plan = useAppInstallPlan();

  if (installed) {
    return (
      <Row
        title={t('pwa.installed')}
        description={t('pwa.installedDescription')}
        action={<span className="text-xs font-semibold text-done">✓</span>}
      />
    );
  }

  // iOS: the store is the whole offer, so link straight to it.
  if (plan?.store && !plan.offerHomeScreen) {
    return (
      <Row
        title={t('pwa.getApp')}
        description={t('pwa.getAppDescription')}
        action={
          <a
            href={plan.store.url}
            target="_blank"
            rel="noopener noreferrer"
            className={actionClass}
          >
            {t('pwa.install')}
          </a>
        }
      />
    );
  }

  // Android: two ways in, so hand off to the card that can describe both rather
  // than picking one here.
  if (plan?.store) {
    return (
      <Row
        title={t('pwa.getApp')}
        description={t('pwa.getAppDescription')}
        action={
          <button type="button" className={actionClass} onClick={openPWAInstallHelp}>
            {t('pwa.install')}
          </button>
        }
      />
    );
  }

  // No store for this device: the browser's own prompt is the only offer, and
  // it can be fired from right here.
  if (plan?.offerHomeScreen && deferredPrompt) {
    return (
      <Row
        title={t('pwa.installApp')}
        description={t('pwa.installDescription')}
        action={
          <button
            type="button"
            className={actionClass}
            onClick={async () => {
              try {
                await deferredPrompt.prompt();
                await deferredPrompt.userChoice;
              } finally {
                clearCapturedBeforeInstallPrompt();
              }
            }}
          >
            {t('pwa.install')}
          </button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm text-text">{t('pwa.installApp')}</div>
      <div className="text-xs text-text-soft/70">{t('pwa.browserMenuInstall')}</div>
    </div>
  );
}
