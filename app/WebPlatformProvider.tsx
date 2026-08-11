'use client';

import { useMemo, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  NavigationProvider,
  type Navigation,
} from '@/packages/product/shared/platform/navigation';
import {
  PlatformCapabilitiesProvider,
  type PlatformCapabilities,
} from '@/packages/product/shared/platform/capabilities';

const WEB_CAPABILITIES: PlatformCapabilities = {
  runtime: 'web',
  canInstallPwa: true,
  hasSecureTokenStorage: false,
  hasNativeHaptics: false,
};

export function WebPlatformProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const navigation = useMemo<Navigation>(() => ({
    pathname,
    push: (href) => router.push(href),
    replace: (href) => router.replace(href),
    back: () => router.back(),
    refresh: () => router.refresh(),
  }), [pathname, router]);
  return (
    <PlatformCapabilitiesProvider value={WEB_CAPABILITIES}>
      <NavigationProvider value={navigation}>{children}</NavigationProvider>
    </PlatformCapabilitiesProvider>
  );
}
