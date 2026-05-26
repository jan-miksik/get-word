'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  installGlobalPWACapture,
  isStandalone,
  PWA_INSTALL_HELP_EVENT,
  readSimulatedPlatformFromUrl,
  type SimulatedPlatform,
} from '@/lib/pwa-install';
import { PWAInstallIntroCard } from '@/features/learning/components/PWAInstallIntroCard';

export function PWAInstallBanner() {
  const [installed, setInstalled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [simulatedPlatform, setSimulatedPlatform] = useState<SimulatedPlatform>(null);

  useEffect(() => {
    const mobileQuery = window.matchMedia?.('(max-width: 900px)');
    const syncMobileViewport = () => setIsMobileViewport(mobileQuery?.matches === true);

    // Idempotent — mirrors the install in PWAInstallMenuItem so the captured
    // `beforeinstallprompt` is available whichever component mounts first.
    installGlobalPWACapture();

    syncMobileViewport();
    setInstalled(isStandalone());
    setSimulatedPlatform(readSimulatedPlatformFromUrl());
    setHydrated(true);

    const onAppInstalled = () => {
      setInstalled(true);
      setHelpOpen(false);
    };
    mobileQuery?.addEventListener('change', syncMobileViewport);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      mobileQuery?.removeEventListener('change', syncMobileViewport);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    const openHelp = () => {
      // Belt + suspenders: never open the install guide on a desktop viewport,
      // even if some upstream code dispatches the event.
      if (typeof window === 'undefined') return;
      if (window.matchMedia?.('(max-width: 900px)')?.matches !== true) return;
      if (isStandalone()) return;
      setHelpOpen(true);
    };
    window.addEventListener(PWA_INSTALL_HELP_EVENT, openHelp);
    return () => window.removeEventListener(PWA_INSTALL_HELP_EVENT, openHelp);
  }, []);

  const close = useCallback(() => setHelpOpen(false), []);

  // Lock body scroll while the overlay is open.
  useEffect(() => {
    if (!helpOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [helpOpen]);

  if (!hydrated || !isMobileViewport || installed) return null;
  if (!helpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[320] flex items-stretch justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Install Get Word to your home screen"
      style={{
        background: 'rgba(0,0,0,0.55)',
      }}
    >
      <div
        className="relative w-full h-full flex flex-col"
        style={{
          maxWidth: 520,
          background: '#dcd1b9',
        }}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
            right: 12,
            zIndex: 2,
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
            border: 'none',
            background: 'rgba(31,20,9,0.08)',
            color: '#1f1409',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <div className="flex-1 min-h-0 overflow-hidden">
          <PWAInstallIntroCard onDismiss={close} simulatedPlatform={simulatedPlatform} />
        </div>
      </div>
    </div>
  );
}
