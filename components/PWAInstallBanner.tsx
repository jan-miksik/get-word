'use client';

import { useEffect, useMemo, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'pwa-install-dismissed-until';
const DISMISS_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const MOBILE_BANNER_OFFSET = 'calc(96px + env(safe-area-inset-bottom, 0px))';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav: any = navigator;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    nav.standalone === true
  );
}

function isDismissed() {
  try {
    const until = localStorage.getItem(DISMISS_KEY);
    if (!until) return false;
    return Date.now() < Number(until);
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DURATION_MS));
  } catch {
    // ignore
  }
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

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const { isIOSSafari } = useMemo(getPlatform, []);

  useEffect(() => {
    setInstalled(isStandalone());
    setDismissed(isDismissed());
    setHydrated(true);

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
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

  useEffect(() => {
    const root = document.documentElement;
    const shouldReserveMobileOffset =
      hydrated && !installed && !dismissed && (deferredPrompt != null || isIOSSafari);

    root.style.setProperty(
      '--pwa-install-banner-offset',
      shouldReserveMobileOffset ? MOBILE_BANNER_OFFSET : '0px'
    );

    return () => {
      root.style.setProperty('--pwa-install-banner-offset', '0px');
    };
  }, [deferredPrompt, dismissed, hydrated, installed, isIOSSafari]);

  // Don't render until hydrated (avoid SSR mismatch)
  if (!hydrated) return null;
  // Already installed
  if (installed) return null;
  // User dismissed recently
  if (dismissed) return null;
  // No install path available
  if (!deferredPrompt && !isIOSSafari) return null;

  const handleDismiss = () => {
    dismiss();
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
    }
  };

  // Desktop: small bottom-right pill (only for beforeinstallprompt platforms)
  // Mobile: full-width bottom banner
  return (
    <>
      {/* Mobile banner — shown on small screens */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-[300] flex items-center gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))] bg-[var(--bg-elevated,#0d1626)] border-t border-[var(--border-subtle,rgba(255,255,255,0.08))] shadow-2xl"
        role="banner"
        aria-label="Install app"
      >
        <div className="flex-1 min-w-0">
          {isIOSSafari ? (
            <>
              <p className="m-0 text-sm font-semibold text-[var(--text,#f1f5f9)]">Add to Home Screen</p>
              <p className="m-0 text-xs text-[var(--text-soft,#94a3b8)] mt-0.5">
                Tap <ShareIcon className="inline align-middle mb-0.5 mx-0.5" /> then{' '}
                <span className="font-semibold text-[var(--text,#f1f5f9)]">Add to Home Screen</span>
              </p>
            </>
          ) : (
            <>
              <p className="m-0 text-sm font-semibold text-[var(--text,#f1f5f9)]">Install Get Word</p>
              <p className="m-0 text-xs text-[var(--text-soft,#94a3b8)] mt-0.5">Works offline · Full-screen experience</p>
            </>
          )}
        </div>

        {!isIOSSafari && (
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="shrink-0 px-4 py-2.5 text-sm font-semibold rounded-xl bg-accent text-white border-none cursor-pointer hover:opacity-90 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            Install
          </button>
        )}

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install banner"
          className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-[var(--text-soft,#94a3b8)] hover:text-[var(--text,#f1f5f9)] hover:bg-white/10 border-none bg-transparent cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Desktop pill — only when native prompt is available */}
      {deferredPrompt && (
        <div
          className="hidden md:flex fixed bottom-6 right-6 z-[300] items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-[var(--bg-elevated,#0d1626)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] shadow-xl"
          role="banner"
          aria-label="Install app"
        >
          <span className="text-sm text-[var(--text-soft,#94a3b8)]">Install Get Word</span>
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full bg-accent text-white border-none cursor-pointer hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            Install
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
            className="h-7 w-7 flex items-center justify-center rounded-full text-[var(--text-soft,#94a3b8)] hover:text-[var(--text,#f1f5f9)] hover:bg-white/10 border-none bg-transparent cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12 2v13M8 6l4-4 4 4M20 16v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
