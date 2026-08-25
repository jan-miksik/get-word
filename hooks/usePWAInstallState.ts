'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  getCapturedBeforeInstallPrompt,
  installGlobalPWACapture,
  isMobileDevice,
  isRunningInstalled,
  onBeforeInstallPromptCaptured,
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
