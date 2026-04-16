'use client';

import { useEffect, useMemo, useState } from 'react';

// Reusing some of the same helpers from PWAInstallBanner
function isStandalone() {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav: any = navigator;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    nav.standalone === true
  );
}

function getPlatform() {
  if (typeof navigator === 'undefined') return { isIOS: false, isIOSSafari: false };
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isIOSChrome = /CriOS/.test(ua);
  const isIOSFirefox = /FxiOS/.test(ua);
  const isIOSSafari = isIOS && !isIOSChrome && !isIOSFirefox;
  return { isIOS, isIOSSafari };
}

export function PWAInstallMenuItem({ onClick }: { onClick?: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setHydrated(true);

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const { isIOS, isIOSSafari } = useMemo(getPlatform, []);

  if (!hydrated || installed) return null;
  if (!deferredPrompt && !isIOS) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } finally {
        setDeferredPrompt(null);
      }
    } else if (isIOSSafari) {
      alert('To install: tap the Share icon at the bottom of Safari, then select "Add to Home Screen".');
    } else if (isIOS) {
      alert('To install: open this page in Safari, tap the Share icon, then select "Add to Home Screen".');
    }
    if (onClick) onClick();
  };

  return (
    <button
      role="menuitem"
      type="button"
      className="menu-item pwa-install-menu-item"
      onClick={handleInstall}
    >
      <span className="menu-item-icon">📱</span>
      <span className="menu-item-label">Install App</span>
      <span className="menu-item-badge">APP</span>
    </button>
  );
}
