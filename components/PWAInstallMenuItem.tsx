'use client';

import { useEffect, useState } from 'react';
import { isStandalone, openPWAInstallHelp } from '@/lib/pwa-install';
import { InstallAppIcon } from '@/components/icons/AppIcons';
import { useI18n } from '@/components/I18nProvider';

export function PWAInstallMenuItem({ onClick }: { onClick?: () => void }) {
  const { t } = useI18n();
  const [installed, setInstalled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    // 900px keeps us in lockstep with isSmallScreen() and the install overlay
    // gate in PWAInstallBanner — so the menu entry and the modal agree on the
    // "is this a mobile viewport" question.
    const mobileQuery = window.matchMedia?.('(max-width: 900px)');
    const syncMobileViewport = () => setIsMobileViewport(mobileQuery?.matches === true);

    syncMobileViewport();
    setInstalled(isStandalone());
    setHydrated(true);

    const onAppInstalled = () => setInstalled(true);

    mobileQuery?.addEventListener('change', syncMobileViewport);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      mobileQuery?.removeEventListener('change', syncMobileViewport);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (!hydrated || !isMobileViewport || installed) return null;

  const handleClick = () => {
    // Always open the in-app guide modal; the modal itself picks the right
    // platform variant (iOS, iOS non-Safari, or Android) and shows the native
    // install dialog from inside its own CTA when possible.
    openPWAInstallHelp();
    if (onClick) onClick();
  };

  return (
    <button
      role="menuitem"
      type="button"
      className="menu-item pwa-install-menu-item"
      onClick={handleClick}
    >
      <span className="menu-item-icon">
        <InstallAppIcon size={15} />
      </span>
      <span className="menu-item-label">{t('pwa.installMenuLabel')}</span>
      <span className="menu-item-badge">APP</span>
    </button>
  );
}
