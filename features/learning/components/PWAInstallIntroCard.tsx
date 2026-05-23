'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import {
  BeforeInstallPromptEvent,
  getInstallPlatform,
  isStandalone,
  type SimulatedPlatform,
} from '@/lib/pwa-install';
import { getPWAInstallIntroCopy } from './pwaInstallCopy';

interface PWAInstallIntroCardProps {
  onDismiss: () => void;
  simulatedPlatform?: SimulatedPlatform;
}

export function PWAInstallIntroCard({ onDismiss, simulatedPlatform }: PWAInstallIntroCardProps) {
  const { language } = useI18n();
  const copy = useMemo(() => getPWAInstallIntroCopy(language), [language]);

  const { isIOS, isIOSSafari } = useMemo(
    () => getInstallPlatform(simulatedPlatform ?? null),
    [simulatedPlatform]
  );
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // When simulating a platform for testing, don't auto-dismiss based on real state.
    if (simulatedPlatform) return;
    if (isStandalone()) {
      onDismiss();
      return;
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => onDismiss();

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [onDismiss, simulatedPlatform]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
      onDismiss();
    }
  };

  const showInstallButton = !!deferredPrompt;
  const showIOSSafari = !showInstallButton && isIOSSafari;
  const showIOSNonSafari = !showInstallButton && isIOS && !isIOSSafari;
  const showDesktopHint = !showInstallButton && !isIOS;

  return (
    <div className="h-full flex flex-col justify-end md:justify-start relative">
      <article className="phrase-card word-card--fullscreen h-full flex flex-col overflow-y-auto">
        <div className="flex-1 flex flex-col gap-5">
          <div className="space-y-3">
            <h2 className="m-0 text-[1.7rem] sm:text-[2rem] leading-tight text-[#2A2218]">
              {copy.title}
            </h2>
            <p className="m-0 text-[1rem] leading-relaxed text-[#2A2218]/75">
              {copy.body}
            </p>
          </div>

          <div className="rounded-2xl border-2 border-[#2A2218] bg-[#F4EFE2] px-4 py-3 text-[#2A2218]">
            <p className="m-0 mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-[#2A2218]/60">
              {copy.advantagesLabel}
            </p>
            <ul className="m-0 list-disc pl-5 space-y-1">
              {copy.advantages.map((item) => (
                <li key={item} className="text-[0.98rem] leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {showIOSSafari && (
            <div className="rounded-2xl border-2 border-[#2A2218] bg-[#F4EFE2] overflow-hidden text-[#2A2218]">
              <div className="relative w-full bg-black" style={{ aspectRatio: '9/16', maxHeight: '40vh' }}>
                <video
                  src="/videos/install-tutorial.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="px-4 py-3">
                <p className="m-0 mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-[#2A2218]/60">
                  {copy.iosSafariStepsLabel}
                </p>
                <ol className="m-0 list-decimal pl-5 space-y-1">
                  {copy.iosSafariSteps.map((step) => (
                    <li key={step} className="text-[0.98rem] leading-relaxed">
                      {step}
                    </li>
                  ))}
                </ol>
                <p className="m-0 mt-2 text-[0.85rem] text-[#2A2218]/70">
                  {copy.iosSafariFootnote}
                </p>
              </div>
            </div>
          )}

          {showIOSNonSafari && (
            <div className="rounded-2xl border-2 border-[#B45309] bg-[#FEF3C7] px-4 py-3 text-[#2A2218]">
              <p className="m-0 text-[0.95rem] leading-relaxed">
                {copy.iosNonSafariNote}
              </p>
            </div>
          )}

          {showDesktopHint && (
            <div className="rounded-2xl border-2 border-[#2A2218]/30 bg-transparent px-4 py-3 text-[#2A2218]">
              <p className="m-0 text-[0.95rem] leading-relaxed">
                {copy.desktopHint}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {showInstallButton ? (
            <>
              <button
                type="button"
                onClick={handleInstall}
                className="rounded-2xl border-2 border-[#2A2218] bg-[#2A2218] px-4 py-3 text-sm font-semibold text-[#F4EFE2] transition-colors hover:bg-[#1E6FA8] hover:border-[#1E6FA8]"
              >
                {copy.installLabel}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-2xl border-2 border-[#2A2218] bg-transparent px-4 py-3 text-sm font-semibold text-[#2A2218] transition-colors hover:bg-[#2A2218]/5"
              >
                {copy.laterLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onDismiss}
              className="sm:col-span-2 rounded-2xl border-2 border-[#2A2218] bg-[#2A2218] px-4 py-3 text-sm font-semibold text-[#F4EFE2] transition-colors hover:bg-[#1E6FA8] hover:border-[#1E6FA8]"
            >
              {copy.gotItLabel}
            </button>
          )}
        </div>
      </article>
    </div>
  );
}
