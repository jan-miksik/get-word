'use client';

import { useEffect, useState } from 'react';
import { installGlobalPWACapture } from '@/lib/pwa-install';

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

  useEffect(() => {
    // Capture the one-shot Android install prompt before any install UI opens.
    installGlobalPWACapture();

    void requestPersistentStorage();

    if (!('serviceWorker' in navigator)) return;
    const serviceWorker = navigator.serviceWorker;

    let didReload = false;
    const reloadOnce = () => {
      if (didReload) return;
      didReload = true;
      window.location.reload();
    };
    const handleControllerChange = reloadOnce;

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

        serviceWorker.addEventListener('controllerchange', handleControllerChange);

        const buildVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? FALLBACK_APP_VERSION;
        const previousBuildVersion = readStoredAppVersion();
        const registration = await serviceWorker.register(
          `/sw.js?build=${encodeURIComponent(buildVersion)}`,
          { scope: '/', updateViaCache: 'none' }
        );
        void registration.update().catch(() => undefined);

        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              serviceWorker.controller
            ) {
              installing.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        if (previousBuildVersion && previousBuildVersion !== buildVersion) {
          await clearGetWordCaches();
          writeStoredAppVersion(buildVersion);
          reloadOnce();
          return;
        }
        if (!previousBuildVersion) {
          writeStoredAppVersion(buildVersion);
        }
      } catch {
        // Intentionally swallow: PWA is an enhancement and should never break the app.
      }
    };

    void register();

    return () => {
      serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

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

  return null;
}
