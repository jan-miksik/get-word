/**
 * Where the service worker lives, and in which of its two modes.
 *
 * The worker does two unrelated jobs: it caches assets for offline use, and it
 * receives Web Push. Only the first is hostile to development — its cache-first
 * rule for `/_next/static/` serves stale chunks and breaks hot reload, which is
 * why dev pages unregister the worker outright. That also removed the only
 * thing a push subscription can live on, so browser reminders could never be
 * tested locally at all.
 *
 * `mode=push-only` splits the two: the worker installs its push and
 * notification-click handlers and adds no fetch handler, so hot reload is
 * untouched and a subscription has somewhere to live.
 */
const PUSH_ONLY_MODE = 'push-only';

/** Only a production build gets the caching worker; see the note above. */
function isProductionServiceWorker(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Opt-in, because a dev worker is still a worker: it survives page reloads and
 * keeps notification permission attached to localhost. Set
 * `NEXT_PUBLIC_DEV_SERVICE_WORKER=1` in `.env.local` to test reminders.
 */
export function devServiceWorkerEnabled(): boolean {
  return !isProductionServiceWorker()
    && process.env.NEXT_PUBLIC_DEV_SERVICE_WORKER === '1';
}

/** True when this page may hold a service worker at all. */
export function serviceWorkerEnabled(): boolean {
  return isProductionServiceWorker() || devServiceWorkerEnabled();
}

export function serviceWorkerScriptUrl(buildVersion: string): string {
  const url = `/sw.js?build=${encodeURIComponent(buildVersion)}`;
  return isProductionServiceWorker() ? url : `${url}&mode=${PUSH_ONLY_MODE}`;
}
