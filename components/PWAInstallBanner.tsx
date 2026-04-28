'use client';

import { useEffect, useMemo, useState } from 'react';
import { getInstallPlatform, isStandalone, PWA_INSTALL_HELP_EVENT } from '@/lib/pwa-install';

export function PWAInstallBanner() {
  const [installed, setInstalled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  const { isIOS } = useMemo(getInstallPlatform, []);

  useEffect(() => {
    const mobileQuery = window.matchMedia?.('(max-width: 767px)');
    const syncMobileViewport = () => setIsMobileViewport(mobileQuery?.matches === true);

    syncMobileViewport();
    setInstalled(isStandalone());
    setHydrated(true);

    const onAppInstalled = () => setInstalled(true);
    mobileQuery?.addEventListener('change', syncMobileViewport);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      mobileQuery?.removeEventListener('change', syncMobileViewport);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    const openHelp = () => setHelpOpen(true);
    window.addEventListener(PWA_INSTALL_HELP_EVENT, openHelp);
    return () => window.removeEventListener(PWA_INSTALL_HELP_EVENT, openHelp);
  }, []);

  if (!hydrated || !isMobileViewport || installed || !isIOS) return null;

  if (!helpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[320] flex items-end justify-center bg-black/60 px-4 pb-4 pt-10 md:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-help-title"
      onClick={(e) => { if (e.target === e.currentTarget) setHelpOpen(false); }}
    >
      <div className="w-full max-w-sm rounded-[28px] border border-[var(--border-subtle,rgba(255,255,255,0.08))] bg-[var(--bg-elevated,#0d1626)] overflow-hidden shadow-2xl">
        {/* Video */}
        <div className="relative w-full bg-black" style={{ aspectRatio: '9/16', maxHeight: '55vh' }}>
          <video
            src="/videos/install-tutorial.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-contain"
          />
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <p
              id="pwa-install-help-title"
              className="m-0 text-base font-semibold text-[var(--text,#f1f5f9)]"
            >
              Add Get Word to your Home Screen
            </p>
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

          <ol className="m-0 list-decimal space-y-2 pl-5 text-sm text-[var(--text,#f1f5f9)]">
            <li>
              Tap the{' '}
              <span className="font-semibold">Share</span>{' '}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="inline align-middle mb-0.5 mx-0.5">
                <path d="M12 2v13M8 6l4-4 4 4M20 16v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>{' '}
              button at the bottom of Safari.
            </li>
            <li>
              Scroll down and tap{' '}
              <span className="font-semibold">Add to Home Screen</span>.
            </li>
            <li>
              Tap <span className="font-semibold">Add</span> in the top-right corner.
            </li>
          </ol>

          <p className="m-0 mt-3 text-xs text-[var(--text-soft,#94a3b8)]">
            Only Safari supports this on iPhone and iPad. If you&apos;re using another browser, open this page in Safari first.
          </p>

          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="mt-4 w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white border-none cursor-pointer hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
