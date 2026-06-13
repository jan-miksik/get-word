'use client';

import { useEffect, useRef, useState } from 'react';
import { installGlobalPWACapture } from '@/lib/pwa-install';
import { usePreferredPublicLanguage } from '@/lib/i18n/client-language';
import { bundledMessages, enMessages, type I18nKey } from '@/lib/i18n/messages';

const CACHE_PREFIX = 'get-word-';
const ACTIVE_LIST_AUDIO_CACHE = 'get-word-active-list-audio-v1';
const APP_VERSION_STORAGE_KEY = 'get-word-pwa-app-version';
const UPDATE_SEEN_AT_STORAGE_KEY = 'get-word-pwa-update-seen-at';
const FALLBACK_APP_VERSION = 'dev';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REFRESH_DELAY_DAYS = 3;

// How long an update may sit waiting before we surface the refresh banner. Most
// users close and reopen the app within a few days, which activates the waiting
// worker silently — so we only nag the long-lived sessions. Override per deploy
// with NEXT_PUBLIC_PWA_REFRESH_AFTER_DAYS (e.g. "0" to show immediately).
function refreshDelayMs(): number {
  const raw = process.env.NEXT_PUBLIC_PWA_REFRESH_AFTER_DAYS;
  if (raw == null || raw === '') return DEFAULT_REFRESH_DELAY_DAYS * DAY_MS;
  const days = Number(raw);
  if (!Number.isFinite(days) || days < 0) return DEFAULT_REFRESH_DELAY_DAYS * DAY_MS;
  return days * DAY_MS;
}

// Set NEXT_PUBLIC_PWA_REFRESH_URGENT="true" for a critical fix that should skip
// the waiting period and prompt every open session right away.
function isUrgentRefresh(): boolean {
  const raw = process.env.NEXT_PUBLIC_PWA_REFRESH_URGENT;
  return raw === 'true' || raw === '1';
}

function readUpdateSeenAt(): number | null {
  try {
    const raw = window.localStorage.getItem(UPDATE_SEEN_AT_STORAGE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeUpdateSeenAt(timestamp: number): void {
  try {
    window.localStorage.setItem(UPDATE_SEEN_AT_STORAGE_KEY, String(timestamp));
  } catch {
    // The delay is best-effort; without storage the banner just shows sooner.
  }
}

function clearUpdateSeenAt(): void {
  try {
    window.localStorage.removeItem(UPDATE_SEEN_AT_STORAGE_KEY);
  } catch {
    // Ignore: a stale timestamp only affects when the banner next appears.
  }
}

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
  const [updateReady, setUpdateReady] = useState(false);
  // Force the refresh banner visible for design review, e.g. `/?pwaBanner=1`.
  // There is no waiting worker behind it, so Refresh just dismisses.
  const [previewBanner, setPreviewBanner] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const language = usePreferredPublicLanguage();
  const t = (key: I18nKey): string =>
    bundledMessages[language]?.[key] ?? enMessages[key] ?? key;

  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).has('pwaBanner')) {
        setPreviewBanner(true);
      }
    } catch {
      // No URL access (very old runtime); the preview override is optional.
    }

    // Capture the one-shot Android install prompt before any install UI opens.
    installGlobalPWACapture();

    void requestPersistentStorage();

    if (!('serviceWorker' in navigator)) return;
    const serviceWorker = navigator.serviceWorker;

    // Surface a passive "new version ready" prompt instead of force-reloading.
    // Only when an updated worker is waiting while an old one already controls
    // the page — never on the initial install of a previously-uncontrolled page.
    const promptUpdate = (worker: ServiceWorker | null) => {
      if (!worker || !serviceWorker.controller) return;
      waitingWorkerRef.current = worker;

      // Urgent deploys (or a zero delay) prompt right away.
      const delay = refreshDelayMs();
      if (isUrgentRefresh() || delay <= 0) {
        setUpdateReady(true);
        return;
      }

      // Otherwise let the waiting worker age: record when it first appeared
      // (persisting across reloads/sessions) and only prompt once the delay
      // has elapsed — by then most users will have applied it by reopening.
      const now = Date.now();
      let seenAt = readUpdateSeenAt();
      if (seenAt == null) {
        seenAt = now;
        writeUpdateSeenAt(seenAt);
      }
      const remaining = seenAt + delay - now;
      if (remaining <= 0) {
        setUpdateReady(true);
        return;
      }
      // Still within the window — show it later if this session stays open.
      bannerTimerRef.current = setTimeout(() => setUpdateReady(true), remaining);
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
        const registration = await serviceWorker.register(
          `/sw.js?build=${encodeURIComponent(buildVersion)}`,
          { scope: '/', updateViaCache: 'none' }
        );
        void registration.update().catch(() => undefined);

        // A newer worker may already be installed and waiting from a prior visit.
        if (registration.waiting) {
          promptUpdate(registration.waiting);
        } else {
          // No update pending right now — reset the aging clock so a future
          // update starts fresh rather than inheriting an old timestamp.
          clearUpdateSeenAt();
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') {
              promptUpdate(installing);
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
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, []);

  const handleRefresh = () => {
    const worker = waitingWorkerRef.current;
    setUpdateReady(false);
    setPreviewBanner(false);
    if (!worker || !('serviceWorker' in navigator)) {
      // No real update behind the banner (e.g. the `?pwaBanner` preview) —
      // just dismiss rather than pointlessly reloading.
      return;
    }
    // Reload once the waiting worker takes control so the page picks up the
    // fresh assets. This runs only because the user clicked Refresh.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    worker.postMessage({ type: 'SKIP_WAITING' });
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

  if (updateReady || previewBanner) {
    return (
      <div className="fixed inset-x-0 bottom-3 z-[400] mx-auto flex w-[min(calc(100vw-1rem),28rem)] items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)]/95 px-4 py-2.5 text-sm text-[var(--text)] shadow-lg backdrop-blur">
        <span className="flex-1">{t('pwa.updateReady')}</span>
        <button
          type="button"
          onClick={handleRefresh}
          className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 font-semibold text-white"
        >
          {t('pwa.refresh')}
        </button>
      </div>
    );
  }

  return null;
}
