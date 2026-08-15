import { useMemo, type ReactNode } from 'react';
import { ActivityTrackingProvider } from '@/components/ActivityTrackingProvider';
import {
  NavigationProvider,
  type Navigation,
} from '@/packages/product/shared/platform/navigation';
import {
  PlatformCapabilitiesProvider,
  type PlatformCapabilities,
} from '@/packages/product/shared/platform/capabilities';
import { goBack, navigate, useRoutePath } from './router';

const NATIVE_CAPABILITIES: PlatformCapabilities = {
  runtime: 'native',
  canInstallPwa: false,
  hasSecureTokenStorage: true,
  hasNativeHaptics: true,
};

export function MobilePlatformProvider({ children }: { children: ReactNode }) {
  const routePath = useRoutePath();
  const pathname = routePath.split(/[?#]/, 1)[0] || '/';
  const navigation = useMemo<Navigation>(() => ({
    pathname,
    push: (href) => navigate(href, 'push'),
    replace: (href) => navigate(href, 'replace'),
    back: () => { goBack(); },
    refresh: () => { window.dispatchEvent(new Event('focus')); },
  }), [pathname]);
  return (
    <PlatformCapabilitiesProvider value={NATIVE_CAPABILITIES}>
      <NavigationProvider value={navigation}>
        <ActivityTrackingProvider>{children}</ActivityTrackingProvider>
      </NavigationProvider>
    </PlatformCapabilitiesProvider>
  );
}
