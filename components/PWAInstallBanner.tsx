'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BeforeInstallPromptEvent,
  getInstallPlatform,
  isStandalone,
  PWA_INSTALL_HELP_EVENT,
} from '@/lib/pwa-install';

const DISMISS_KEY = 'pwa-install-dismissed-until';
const DISMISS_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const MOBILE_BANNER_OFFSET = 'calc(96px + env(safe-area-inset-bottom, 0px))';

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

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const { isIOS, isIOSSafari } = useMemo(getInstallPlatform, []);

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
    const openHelp = () => setHelpOpen(true);

    window.addEventListener(PWA_INSTALL_HELP_EVENT, openHelp);
    return () => {
      window.removeEventListener(PWA_INSTALL_HELP_EVENT, openHelp);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const shouldReserveMobileOffset =
      hydrated && !installed && !dismissed && (deferredPrompt != null || isIOS);

    root.style.setProperty(
      '--pwa-install-banner-offset',
      shouldReserveMobileOffset ? MOBILE_BANNER_OFFSET : '0px'
    );

    return () => {
      root.style.setProperty('--pwa-install-banner-offset', '0px');
    };
  }, [deferredPrompt, dismissed, hydrated, installed, isIOS]);

  // Don't render until hydrated (avoid SSR mismatch)
  if (!hydrated) return null;
  // Already installed
  if (installed) return null;
  // User dismissed recently
  if (dismissed) return null;
  // No install path available
  if (!deferredPrompt && !isIOS) return null;

  const handleDismiss = () => {
    dismiss();
    setDismissed(true);
    setHelpOpen(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) {
      setHelpOpen(true);
      return;
    }

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
          {isIOS ? (
            <>
              <p className="m-0 text-sm font-semibold text-[var(--text,#f1f5f9)]">Add to Home Screen</p>
              <p className="m-0 text-xs text-[var(--text-soft,#94a3b8)] mt-0.5">
                One more step in your browser menu to install Get Word.
              </p>
            </>
          ) : (
            <>
              <p className="m-0 text-sm font-semibold text-[var(--text,#f1f5f9)]">Install Get Word</p>
              <p className="m-0 text-xs text-[var(--text-soft,#94a3b8)] mt-0.5">Works offline · Full-screen experience</p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleInstall()}
          className="shrink-0 px-4 py-2.5 text-sm font-semibold rounded-xl bg-accent text-white border-none cursor-pointer hover:opacity-90 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Install
        </button>

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

      {isIOS && helpOpen && (
        <div
          className="fixed inset-0 z-[320] flex items-end justify-center bg-black/60 px-4 pb-4 pt-10 md:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-help-title"
        >
          <div className="w-full max-w-md rounded-[28px] border border-[var(--border-subtle,rgba(255,255,255,0.08))] bg-[var(--bg-elevated,#0d1626)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p
                  id="pwa-install-help-title"
                  className="m-0 text-base font-semibold text-[var(--text,#f1f5f9)]"
                >
                  Add Get Word to your Home Screen
                </p>
                <p className="m-0 mt-1 text-sm text-[var(--text-soft,#94a3b8)]">
                  iPhone and iPad still require the browser&apos;s own install flow.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="Close install help"
                className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl text-[var(--text-soft,#94a3b8)] hover:text-[var(--text,#f1f5f9)] hover:bg-white/10 border-none bg-transparent cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <ol className="m-0 mt-4 list-decimal space-y-3 pl-5 text-sm text-[var(--text,#f1f5f9)]">
              <li>
                Tap the browser&apos;s <span className="font-semibold">Share</span> button
                {isIOSSafari ? (
                  <>
                    {' '}
                    <ShareIcon className="inline align-middle mb-0.5 mx-0.5" /> in Safari.
                  </>
                ) : (
                  <> or the browser menu.</>
                )}
              </li>
              <li>
                Choose <span className="font-semibold">Add to Home Screen</span>.
              </li>
              <li>
                Tap <span className="font-semibold">Add</span> in the top-right corner.
              </li>
            </ol>

            {!isIOSSafari && (
              <p className="m-0 mt-4 rounded-2xl bg-white/5 px-3 py-2 text-xs text-[var(--text-soft,#94a3b8)]">
                If your current browser doesn&apos;t show <span className="font-semibold text-[var(--text,#f1f5f9)]">Add to Home Screen</span>,
                open this page in Safari and repeat the same steps there.
              </p>
            )}

            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="mt-4 w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white border-none cursor-pointer hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              Close
            </button>
          </div>
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
