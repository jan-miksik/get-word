'use client';

import { useEffect, useMemo, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  // iOS Safari
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav: any = navigator;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    nav.standalone === true
  );
}

function getInstallHelp() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isIOSChrome = /CriOS/.test(ua);
  const isIOSFirefox = /FxiOS/.test(ua);
  const isIOSSafari = isIOS && !isIOSChrome && !isIOSFirefox;

  return { isIOS, isIOSSafari };
}

export function PWAInstallSection() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => setInstalled(true);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const { isIOS, isIOSSafari } = useMemo(getInstallHelp, []);

  if (installed) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-text">Installed</div>
          <div className="text-xs text-text-soft/70">This app is available on your home screen.</div>
        </div>
        <span className="text-xs font-semibold text-done">✓</span>
      </div>
    );
  }

  if (deferredPrompt) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-text">Install app</div>
          <div className="text-xs text-text-soft/70">Get a full-screen, offline-capable experience.</div>
        </div>
        <button
          type="button"
          className="px-3 py-2 text-xs font-semibold rounded-xl border border-accent/40 bg-accent/10 text-accent cursor-pointer hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          onClick={async () => {
            try {
              await deferredPrompt.prompt();
              await deferredPrompt.userChoice;
            } finally {
              setDeferredPrompt(null);
            }
          }}
        >
          Install
        </button>
      </div>
    );
  }

  if (isIOSSafari) {
    return (
      <div className="flex flex-col gap-1">
        <div className="text-sm text-text">Add to Home Screen (iPhone/iPad)</div>
        <div className="text-xs text-text-soft/70">
          In Safari: tap Share → <span className="font-semibold">Add to Home Screen</span>.
        </div>
      </div>
    );
  }

  if (isIOS) {
    return (
      <div className="flex flex-col gap-1">
        <div className="text-sm text-text">Install on iPhone/iPad</div>
        <div className="text-xs text-text-soft/70">
          Open this page in Safari to use Share → <span className="font-semibold">Add to Home Screen</span>.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm text-text">Install app</div>
      <div className="text-xs text-text-soft/70">
        Use your browser menu → <span className="font-semibold">Install app</span> or <span className="font-semibold">Add to Home screen</span>.
      </div>
    </div>
  );
}

