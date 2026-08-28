'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  resolveAppInstallPlan,
  type AppInstallPlan,
} from '@/lib/app-install';
import {
  getCapturedBeforeInstallPrompt,
  installGlobalPWACapture,
  isMobileDevice,
  isRunningInstalled,
  onBeforeInstallPromptCaptured,
  getInstallPlatform,
  isAndroid,
  readSimulatedPlatformFromUrl,
  type BeforeInstallPromptEvent,
  type SimulatedPlatform,
} from '@/lib/pwa-install';
import { usePlatformCapabilities } from '@/packages/product/shared/platform/capabilities';

const noopSubscribe = () => () => {};
const serverFalse = () => false;
const serverNull = () => null;

function subscribeToInstalled(onChange: () => void) {
  window.addEventListener('appinstalled', onChange);
  return () => window.removeEventListener('appinstalled', onChange);
}

function subscribeToMobileViewport(onChange: () => void) {
  const query = window.matchMedia?.('(max-width: 900px)');
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

const readMobileViewport = () =>
  window.matchMedia?.('(max-width: 900px)').matches === true;

export function useStandaloneStatus(): boolean {
  const { runtime } = usePlatformCapabilities();
  return useSyncExternalStore(
    subscribeToInstalled,
    () => runtime === 'native' || isRunningInstalled(),
    serverFalse,
  );
}

/**
 * Whether to offer "add to home screen" at all. The invitation only makes
 * sense on a phone that is looking at the site in a browser: the iOS shell and
 * the Play wrapper are already the installed app, and a narrow desktop window
 * is not a home screen.
 */
export function useHomeScreenInvite(): boolean {
  const installed = useStandaloneStatus();
  // Carries the native-runtime check through `canInstallPwa`.
  const isMobileViewport = useMobileViewport();
  // UA-derived and constant for the session, hence the no-op subscribe.
  const onMobileDevice = useSyncExternalStore(noopSubscribe, isMobileDevice, serverFalse);
  return !installed && isMobileViewport && onMobileDevice;
}

function useMobileViewport(): boolean {
  const { canInstallPwa } = usePlatformCapabilities();
  return useSyncExternalStore(
    subscribeToMobileViewport,
    () => canInstallPwa && readMobileViewport(),
    serverFalse,
  );
}

export function useSimulatedInstallPlatform(): SimulatedPlatform {
  return useSyncExternalStore(noopSubscribe, readSimulatedPlatformFromUrl, serverNull);
}

export function useCapturedInstallPrompt(): BeforeInstallPromptEvent | null {
  useEffect(() => {
    installGlobalPWACapture();
  }, []);

  return useSyncExternalStore(
    onBeforeInstallPromptCaptured,
    getCapturedBeforeInstallPrompt,
    serverNull,
  );
}

export function useRefreshBannerPreview(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return new URLSearchParams(window.location.search).has('pwaBanner');
      } catch {
        return false;
      }
    },
    serverFalse,
  );
}

/**
 * A string, not an object: `useSyncExternalStore` compares snapshots by
 * identity, so a fresh `{ isIOS, isAndroid }` on every read would look like a
 * change on every render and spin the component forever.
 */
type InstallPlatform = 'ios' | 'android' | 'other';

const serverPlatform = (): InstallPlatform => 'other';

function readInstallPlatform(): InstallPlatform {
  // Android first: an Android tablet reporting "Tablet" must not fall through
  // to the iPad branch of getInstallPlatform.
  if (isAndroid()) return 'android';
  return getInstallPlatform().isIOS ? 'ios' : 'other';
}

/**
 * The install path to offer this device, or null when there is none.
 *
 * The policy itself is in `lib/app-install`; this only feeds it the browser
 * readings. Both of those come from `useSyncExternalStore`, so the server
 * snapshot is a desktop that has nothing on offer and the real answer arrives
 * after hydration rather than mismatching.
 */
export function useAppInstallPlan(): AppInstallPlan | null {
  const { runtime } = usePlatformCapabilities();
  const isMobile = useMobileViewport();
  const isInstalled = useStandaloneStatus();
  // UA-derived and constant for the session, hence the no-op subscribe.
  const platform = useSyncExternalStore(noopSubscribe, readInstallPlatform, serverPlatform);

  return useMemo(
    () =>
      resolveAppInstallPlan({
        runtime,
        isInstalled,
        isMobile,
        isIOS: platform === 'ios',
        isAndroid: platform === 'android',
      }),
    [isInstalled, isMobile, platform, runtime],
  );
}
