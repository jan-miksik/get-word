'use client';

import { useEffect, useMemo, useState } from 'react';
import { getInstallPlatform, isStandalone, openPWAInstallHelp } from '@/lib/pwa-install';
import { InstallAppIcon } from '@/components/icons/AppIcons';
import { useI18n } from '@/components/I18nProvider';

export function PWAInstallMenuItem({ onClick }: { onClick?: () => void }) {
  const { t } = useI18n();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia?.('(max-width: 767px)');
    const syncMobileViewport = () => setIsMobileViewport(mobileQuery?.matches === true);

    syncMobileViewport();
    setInstalled(isStandalone());
    setHydrated(true);

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    mobileQuery?.addEventListener('change', syncMobileViewport);
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      mobileQuery?.removeEventListener('change', syncMobileViewport);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const { isIOS } = useMemo(getInstallPlatform, []);

  if (!hydrated || !isMobileViewport || installed) return null;
  if (!deferredPrompt && !isIOS) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } finally {
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      openPWAInstallHelp();
    }
    if (onClick) onClick();
  };

  return (
    <button
      role="menuitem"
      type="button"
      className="menu-item pwa-install-menu-item"
      onClick={handleInstall}
    >
      <span className="menu-item-icon">
        <InstallAppIcon size={15} />
      </span>
      <span className="menu-item-label">{t('pwa.installMenuLabel')}</span>
      <span className="menu-item-badge">APP</span>
    </button>
  );
}
