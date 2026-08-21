'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  isRunningInstalled,
  PWA_INSTALL_HELP_EVENT,
} from '@/lib/pwa-install';
import { PWAInstallIntroCard } from '@/features/learning/components/PWAInstallIntroCard';
import {
  useHomeScreenInvite,
  useSimulatedInstallPlatform,
} from '@/hooks/usePWAInstallState';

export function PWAInstallBanner() {
  const [helpOpen, setHelpOpen] = useState(false);
  const showInvite = useHomeScreenInvite();
  const simulatedPlatform = useSimulatedInstallPlatform();

  useEffect(() => {
    const openHelp = () => {
      // Belt + suspenders: never open the install guide on a desktop viewport,
      // even if some upstream code dispatches the event.
      if (typeof window === 'undefined') return;
      if (window.matchMedia?.('(max-width: 900px)')?.matches !== true) return;
      if (isRunningInstalled()) return;
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

  // The `?previewPWAInstallIntro=` parameter is the only way to look at the
  // guide from a desktop browser, so it deliberately outranks the gate.
  if (!showInvite && !simulatedPlatform) return null;
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
