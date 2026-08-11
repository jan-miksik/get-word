'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { PWAInstallSection } from '@/components/PWAInstallSection';
import { Section } from './primitives';
import { usePlatformCapabilities } from '@/packages/product/shared/platform/capabilities';

export function AppInstallSection() {
  const { t } = useI18n();
  const { canInstallPwa } = usePlatformCapabilities();
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    if (!canInstallPwa) return;
    const mobileQuery = window.matchMedia?.('(max-width: 767px)');
    const syncMobileViewport = () => setIsMobileViewport(mobileQuery?.matches === true);

    syncMobileViewport();
    mobileQuery?.addEventListener('change', syncMobileViewport);
    return () => mobileQuery?.removeEventListener('change', syncMobileViewport);
  }, [canInstallPwa]);

  if (!canInstallPwa || !isMobileViewport) return null;

  return (
    <Section label={t('settings.app')}>
      <PWAInstallSection />
    </Section>
  );
}
