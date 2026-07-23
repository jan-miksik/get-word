'use client';

import { useEffect, useState } from 'react';
import { installGlobalPWACapture } from '@/lib/pwa-install';
import { usePreferredPublicLanguage } from '@/lib/i18n/client-language';
import { bundledMessages, enMessages, type I18nKey } from '@/lib/i18n/messages';
import { useRefreshBannerPreview } from '@/hooks/usePWAInstallState';

const CACHE_PREFIX = 'get-word-';
const ACTIVE_LIST_AUDIO_CACHE = 'get-word-active-list-audio-v1';
const APP_VERSION_STORAGE_KEY = 'get-word-pwa-app-version';
const FALLBACK_APP_VERSION = 'dev';

async function clearGetWordCaches() {
  if (!('caches' in window)) return;

  const cacheKeys = await caches.keys();
  await Promise.all(
    cacheKeys
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .filter((key) => key !== ACTIVE_LIST_AUDIO_CACHE)
      .map((key) => caches.delete(key))
  );
}

async function requestPersistentStorage() {
  // Ask the browser to exempt our IndexedDB/cache storage from eviction. On
  // installed PWAs and engaged sites this is granted silently; SRS progress
  // that hasn't synced yet must survive storage pressure.
  if (!navigator.storage?.persist) return;
  try {
    if (await navigator.storage.persisted()) return;
    await navigator.storage.persist();
  } catch {
    // Best-effort: storage still works without the persistent grant.
  }
}

async function unregisterExistingWorkers() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

function readStoredAppVersion(): string | null {
  try {
    return window.localStorage.getItem(APP_VERSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredAppVersion(version: string): void {
  try {
    window.localStorage.setItem(APP_VERSION_STORAGE_KEY, version);
  } catch {
    // Version tracking is a recovery aid; the PWA still works without it.
  }
}

export function PWARegister() {
  const [devStatus, setDevStatus] = useState<{
    controlled: boolean;
    cachesCleared: number;
  } | null>(null);
  // Force the refresh banner visible for design review, e.g. `/?pwaBanner=1`.
  // Production updates are silent (see below), so this is the only path that
  // ever renders the banner and Refresh just dismisses it.
  const previewRequested = useRefreshBannerPreview();
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const previewBanner = previewRequested && !previewDismissed;

  const language = usePreferredPublicLanguage();
  const t = (key: I18nKey): string =>
    bundledMessages[language]?.[key] ?? enMessages[key] ?? key;

  useEffect(() => {
    // Capture the one-shot Android install prompt before any install UI opens.
    installGlobalPWACapture();

    void requestPersistentStorage();

    if (!('serviceWorker' in navigator)) return;
    const serviceWorker = navigator.serviceWorker;
    let pageLoadedFreshBuild = false;
    let updateArmed = false;
    let removeForegroundListener: (() => void) | null = null;

    // Reload the page once the waiting worker takes control, so the running app
    // swaps to the freshly-activated build's assets. Guarded to fire once.
    const reloadOnControllerChange = () => {
      let reloaded = false;
      serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    };

    const activateAlreadyLoadedUpdate = (worker: ServiceWorker) => {
      // The user has already loaded the new client bundle, usually via a manual
      // browser refresh, so the waiting worker can take over without another
      // reload — the page is already running the new code.
      worker.postMessage({ type: 'SKIP_WAITING' });
    };

    // The page is still running the previous bundle. Swap to the new one at a
    // non-disruptive moment — the next time the app returns to the foreground —
    // so a long-lived open session picks up the change without being yanked
    // mid-interaction.
    const applyUpdateWhenSafe = (worker: ServiceWorker) => {
      if (updateArmed) return;
      updateArmed = true;

      const onForeground = () => {
        if (document.visibilityState !== 'visible') return;
        removeForegroundListener?.();
        removeForegroundListener = null;
        reloadOnControllerChange();
        worker.postMessage({ type: 'SKIP_WAITING' });
      };
      // `visibilitychange` fires on real transitions, so arming while visible
      // means the update applies only after the user leaves and comes back.
      document.addEventListener('visibilitychange', onForeground);
      removeForegroundListener = () =>
        document.removeEventListener('visibilitychange', onForeground);
    };

    // Decide how to apply an installed/waiting worker. Only when an updated
    // worker is waiting while an old one already controls the page — never on
    // the initial install of a previously-uncontrolled page.
    const handleWaitingWorker = (worker: ServiceWorker | null) => {
      if (!worker || !serviceWorker.controller) return;
      if (pageLoadedFreshBuild) {
        activateAlreadyLoadedUpdate(worker);
        return;
      }
      applyUpdateWhenSafe(worker);
    };

    const register = async () => {
      try {
        if (process.env.NODE_ENV !== 'production') {
          const wasControlled = Boolean(serviceWorker.controller);
          const cacheKeys = 'caches' in window
            ? (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX))
            : [];

          await unregisterExistingWorkers();
          await clearGetWordCaches();
          if (wasControlled) {
            console.warn(
              '[PWA] A stale service worker was controlling this dev page. It has been unregistered and Get Word caches were cleared. Reload once if the UI still looks old.'
            );
          }
          setDevStatus({
            controlled: wasControlled,
            cachesCleared: cacheKeys.length,
          });

          return;
        }

        const buildVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? FALLBACK_APP_VERSION;
        const previousBuildVersion = readStoredAppVersion();
        pageLoadedFreshBuild = previousBuildVersion !== null && previousBuildVersion !== buildVersion;
        const registration = await serviceWorker.register(
          `/sw.js?build=${encodeURIComponent(buildVersion)}`,
          { scope: '/', updateViaCache: 'none' }
        );
        void registration.update().catch(() => undefined);

        // A newer worker may already be installed and waiting from a prior visit.
        if (registration.waiting) {
          handleWaitingWorker(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') {
              handleWaitingWorker(installing);
            }
          });
        });

        if (previousBuildVersion !== buildVersion) {
          writeStoredAppVersion(buildVersion);
        }
      } catch {
        // Intentionally swallow: PWA is an enhancement and should never break the app.
      }
    };

    void register();

    return () => {
      removeForegroundListener?.();
    };
  }, []);

  const handleDismissPreview = () => {
    // Only the `?pwaBanner` design preview reaches this button; real updates
    // apply silently, so there is nothing to reload here.
    setPreviewDismissed(true);
  };

  if (
    process.env.NODE_ENV !== 'production' &&
    devStatus?.controlled
  ) {
    return (
      <div className="fixed left-1/2 top-3 z-[400] w-[min(calc(100vw-1rem),42rem)] -translate-x-1/2 rounded-xl border border-amber-400/35 bg-amber-100/95 px-3 py-2 text-xs text-amber-950 shadow-lg backdrop-blur">
        <div className="font-semibold">Stale service worker detected in dev</div>
        <div className="mt-0.5">
          Get Word cleared {devStatus.cachesCleared} cache
          {devStatus.cachesCleared === 1 ? '' : 's'} and unregistered the old worker.
          Reload once if the page still looks outdated.
        </div>
      </div>
    );
  }

  if (previewBanner) {
    return (
      <div className="fixed inset-x-0 bottom-3 z-[400] mx-auto flex w-[min(calc(100vw-1rem),28rem)] items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)]/95 px-4 py-2.5 text-sm text-[var(--text)] shadow-lg backdrop-blur">
        <span className="flex-1">{t('pwa.updateReady')}</span>
        <button
          type="button"
          onClick={handleDismissPreview}
          className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 font-semibold text-white"
        >
          {t('pwa.refresh')}
        </button>
      </div>
    );
  }

  return null;
}
