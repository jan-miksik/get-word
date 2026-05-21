'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BeforeInstallPromptEvent,
  getInstallPlatform,
  isStandalone,
  openPWAInstallHelp,
} from '@/lib/pwa-install';
import { useI18n } from '@/components/I18nProvider';

export function PWAInstallSection() {
  const { t } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => setInstalled(true);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const { isIOS, isIOSSafari } = useMemo(getInstallPlatform, []);

  if (installed) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-text">{t('pwa.installed')}</div>
          <div className="text-xs text-text-soft/70">{t('pwa.installedDescription')}</div>
        </div>
        <span className="text-xs font-semibold text-done">✓</span>
      </div>
    );
  }

  if (deferredPrompt) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-text">{t('pwa.installApp')}</div>
          <div className="text-xs text-text-soft/70">{t('pwa.installDescription')}</div>
        </div>
        <button
          type="button"
          className="px-3 py-2 text-xs font-semibold rounded-xl border border-accent/40 bg-accent/10 text-accent cursor-pointer hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          onClick={async () => {
            try {
              await deferredPrompt.prompt();
              await deferredPrompt.userChoice;
            } finally {
              setDeferredPrompt(null);
            }
          }}
        >
          {t('pwa.install')}
        </button>
      </div>
    );
  }

  if (isIOSSafari) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-text">{t('pwa.addToHomeScreenIos')}</div>
          <div className="text-xs text-text-soft/70">
            {t('pwa.safariRequires')}
          </div>
        </div>
        <button
          type="button"
          className="px-3 py-2 text-xs font-semibold rounded-xl border border-accent/40 bg-accent/10 text-accent cursor-pointer hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          onClick={openPWAInstallHelp}
        >
          {t('pwa.install')}
        </button>
      </div>
    );
  }

  if (isIOS) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-text">{t('pwa.installOnIos')}</div>
          <div className="text-xs text-text-soft/70">
            {t('pwa.iosDescription')}
          </div>
        </div>
        <button
          type="button"
          className="px-3 py-2 text-xs font-semibold rounded-xl border border-accent/40 bg-accent/10 text-accent cursor-pointer hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          onClick={openPWAInstallHelp}
        >
          {t('pwa.install')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm text-text">{t('pwa.installApp')}</div>
      <div className="text-xs text-text-soft/70">
        {t('pwa.browserMenuInstall')}
      </div>
    </div>
  );
}
