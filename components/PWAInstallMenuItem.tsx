'use client';

import { openPWAInstallHelp } from '@/lib/pwa-install';
import { InstallAppIcon } from '@/components/icons/AppIcons';
import { useI18n } from '@/components/I18nProvider';
import { useAppInstallPlan } from '@/hooks/usePWAInstallState';

export function PWAInstallMenuItem({ onClick }: { onClick?: () => void }) {
  const { t } = useI18n();
  // Null on a desktop, inside the shipped apps, and once the app is installed —
  // the three cases where there is nothing to offer.
  const plan = useAppInstallPlan();

  if (!plan) return null;

  const handleClick = () => {
    // Always open the in-app card; it decides between the store button and the
    // home-screen prompt, so this entry point never has to.
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
