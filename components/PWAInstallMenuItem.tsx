'use client';

import { openPWAInstallHelp } from '@/lib/pwa-install';
import { InstallAppIcon } from '@/components/icons/AppIcons';
import { useI18n } from '@/components/I18nProvider';
import { useHomeScreenInvite } from '@/hooks/usePWAInstallState';

export function PWAInstallMenuItem({ onClick }: { onClick?: () => void }) {
  const { t } = useI18n();
  const showInvite = useHomeScreenInvite();

  if (!showInvite) return null;

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
