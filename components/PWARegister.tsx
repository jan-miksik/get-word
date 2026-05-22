'use client';

import { useEffect, useState } from 'react';

const CACHE_PREFIX = 'wordlink-';

async function clearGetWordCaches() {
  if (!('caches' in window)) return;

  const cacheKeys = await caches.keys();
  await Promise.all(
    cacheKeys
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .map((key) => caches.delete(key))
  );
}

async function unregisterExistingWorkers() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

export function PWARegister() {
  const [devStatus, setDevStatus] = useState<{
    controlled: boolean;
    cachesCleared: number;
  } | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const serviceWorker = navigator.serviceWorker;

    let didReloadForControllerChange = false;
    const handleControllerChange = () => {
      if (didReloadForControllerChange) return;
      didReloadForControllerChange = true;
      window.location.reload();
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
          setDevStatus({
            controlled: wasControlled,
            cachesCleared: cacheKeys.length,
          });

          return;
        }

        serviceWorker.addEventListener('controllerchange', handleControllerChange);

        const buildVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';
        const registration = await serviceWorker.register(
          `/sw.js?build=${encodeURIComponent(buildVersion)}`,
          { scope: '/' }
        );

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
