'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  persistPWAInstallPromptAnswered,
  readPWAInstallPromptAnswered,
} from '@/features/learning/app-state/storage';
import type { ViewMode } from '@/features/learning/app-state/types';
import {
  isMobileDevice,
  isRunningInstalled,
  isSmallScreen,
  type SimulatedPlatform,
} from '@/lib/pwa-install';
import { useAppInstallPlan } from '@/hooks/usePWAInstallState';
import { usePlatformCapabilities } from '@/packages/product/shared/platform/capabilities';

type PWAInstallIntroOptions = {
  viewMode: ViewMode;
  shouldShowMemoryHooksIntro: boolean;
  completedDeckWordCards: number;
};

type PWAInstallEnvironment = {
  promptAnswered: boolean;
  isInstalled: boolean;
  isOnMobileDevice: boolean;
  isOnSmallScreen: boolean;
};

function readPreviewPWAInstallIntro(): { enabled: boolean; simulated: SimulatedPlatform } {
  if (typeof window === 'undefined') return { enabled: false, simulated: null };
  const params = new URLSearchParams(window.location.search);
  if (!params.has('previewPWAInstallIntro')) return { enabled: false, simulated: null };
  const raw = (params.get('previewPWAInstallIntro') ?? '').toLowerCase();
  let simulated: SimulatedPlatform = null;
  if (raw === 'ios') simulated = 'ios';
  else if (raw === 'android') simulated = 'android';
  return { enabled: true, simulated };
}

function readPWAInstallEnvironment(): PWAInstallEnvironment {
  return {
    promptAnswered: readPWAInstallPromptAnswered(),
    isInstalled: isRunningInstalled(),
    isOnMobileDevice: isMobileDevice(),
    isOnSmallScreen: isSmallScreen(),
  };
}

export function usePWAInstallIntro({
  viewMode,
  shouldShowMemoryHooksIntro,
  completedDeckWordCards,
}: PWAInstallIntroOptions) {
  const capabilities = usePlatformCapabilities();
  // Null when there is nothing this device can be offered. Without it a tablet
  // wide enough to miss the mobile breakpoint still passed the device check
  // below and got a card whose only content was a browser-menu hint.
  const installPlan = useAppInstallPlan();
  const [previewPWAInstallIntro] = useState(readPreviewPWAInstallIntro);
  const [environment, setEnvironment] = useState<PWAInstallEnvironment>(readPWAInstallEnvironment);
  const [previewPWADismissed, setPreviewPWADismissed] = useState(false);

  useEffect(() => {
    const onAppInstalled = () => {
      setEnvironment((current) => ({ ...current, isInstalled: true }));
    };
    const onResize = () => {
      setEnvironment((current) => ({ ...current, isOnSmallScreen: isSmallScreen() }));
    };
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const dismissPWAInstallIntro = useCallback(() => {
    persistPWAInstallPromptAnswered(true);
    setEnvironment((current) => ({ ...current, promptAnswered: true }));
    setPreviewPWADismissed(true);
  }, []);

  const isPWAVisibleForViewport = environment.isOnMobileDevice || environment.isOnSmallScreen;
  const isPreviewPWAActive =
    previewPWAInstallIntro.enabled && isPWAVisibleForViewport && !previewPWADismissed;

  const shouldShowPWAInstallIntro =
    capabilities.canInstallPwa &&
    (isPreviewPWAActive ||
      (viewMode === 'card' &&
        installPlan !== null &&
        environment.isOnMobileDevice &&
        !shouldShowMemoryHooksIntro &&
        !environment.promptAnswered &&
        !environment.isInstalled &&
        completedDeckWordCards >= 10));

  return {
    dismissPWAInstallIntro,
    isPreviewPWAActive,
    previewPWAInstallIntro,
    shouldShowPWAInstallIntro,
  };
}
