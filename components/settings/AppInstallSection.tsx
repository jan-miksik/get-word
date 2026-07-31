'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { PWAInstallSection } from '@/components/PWAInstallSection';
import { Section } from './primitives';
import { isNativeAppRuntime } from '@/lib/runtime-platform';

export function AppInstallSection() {
  const { t } = useI18n();
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    if (isNativeAppRuntime()) return;
    const mobileQuery = window.matchMedia?.('(max-width: 767px)');
    const syncMobileViewport = () => setIsMobileViewport(mobileQuery?.matches === true);

    syncMobileViewport();
    mobileQuery?.addEventListener('change', syncMobileViewport);
    return () => mobileQuery?.removeEventListener('change', syncMobileViewport);
  }, []);

  if (isNativeAppRuntime() || !isMobileViewport) return null;

  return (
    <Section label={t('settings.app')}>
      <PWAInstallSection />
    </Section>
  );
}
