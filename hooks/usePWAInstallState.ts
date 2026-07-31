'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  getCapturedBeforeInstallPrompt,
  installGlobalPWACapture,
  isStandalone,
  onBeforeInstallPromptCaptured,
  readSimulatedPlatformFromUrl,
  type BeforeInstallPromptEvent,
  type SimulatedPlatform,
} from '@/lib/pwa-install';
import { isNativeAppRuntime } from '@/lib/runtime-platform';

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
  return useSyncExternalStore(
    subscribeToInstalled,
    () => isNativeAppRuntime() || isStandalone(),
    serverFalse,
  );
}

export function useMobileViewport(): boolean {
  return useSyncExternalStore(
    subscribeToMobileViewport,
    () => !isNativeAppRuntime() && readMobileViewport(),
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
