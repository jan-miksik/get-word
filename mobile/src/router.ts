import { useSyncExternalStore } from 'react';

/**
 * The native bundle has no Next router. Keep routing in the WebView history so
 * shared pages can read `window.location`, the iOS back gesture works, and
 * query-driven surfaces (chat/photo lab) can share the same history stack.
 */
type Listener = () => void;

const NATIVE_ROUTE_HISTORY_KEY = 'getWordNativeRoute';
const NATIVE_ROUTE_HISTORY_MARKER = 'get-word-native-route-v1';

type NativeRouteHistoryEntry = {
  marker: typeof NATIVE_ROUTE_HISTORY_MARKER;
  depth: number;
};

const listeners = new Set<Listener>();
let listeningForPopState = false;
let routeDepth = 0;

function readHistoryEntry(state: unknown): NativeRouteHistoryEntry | null {
  if (!state || typeof state !== 'object') return null;
  const candidate = (state as Record<string, unknown>)[NATIVE_ROUTE_HISTORY_KEY];
  if (!candidate || typeof candidate !== 'object') return null;
  const entry = candidate as Partial<NativeRouteHistoryEntry>;
  if (
    entry.marker !== NATIVE_ROUTE_HISTORY_MARKER ||
    typeof entry.depth !== 'number' ||
    !Number.isInteger(entry.depth) ||
    entry.depth < 0
  ) {
    return null;
  }
  return entry as NativeRouteHistoryEntry;
}

function withHistoryEntry(state: unknown, depth: number): Record<string, unknown> {
  const base = state && typeof state === 'object' ? state as Record<string, unknown> : {};
  return {
    ...base,
    [NATIVE_ROUTE_HISTORY_KEY]: {
      marker: NATIVE_ROUTE_HISTORY_MARKER,
      depth,
    } satisfies NativeRouteHistoryEntry,
  };
}

function normalize(href: string): string {
  if (!href) return '/';
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) {
    throw new Error(`External URL cannot be handled by the native router: ${href}`);
  }

  const url = new URL(href.startsWith('/') ? href : `/${href}`, 'https://getword.app');
  // Photo lab is integrated into HomeClient in the native app. Preserve the
  // public web route while mapping native navigation to that in-place surface.
  if (url.pathname === '/photo-lab') {
    url.pathname = '/';
    url.searchParams.set('surface', 'photo');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function installPopStateListener(): void {
  if (listeningForPopState || typeof window === 'undefined') return;
  listeningForPopState = true;
  const existing = readHistoryEntry(window.history.state);
  routeDepth = existing?.depth ?? 0;
  if (!existing) {
    window.history.replaceState(
      withHistoryEntry(window.history.state, routeDepth),
      '',
      getRoutePath(),
    );
  }
  window.addEventListener('popstate', (event) => {
    routeDepth = readHistoryEntry(event.state)?.depth ?? 0;
    emit();
  });
}

export function getRoutePath(): string {
  if (typeof window === 'undefined') return '/';
  const pathname = window.location.pathname === '/index.html' ? '/' : window.location.pathname;
  return `${pathname || '/'}${window.location.search}${window.location.hash}`;
}

export function navigate(href: string, mode: 'push' | 'replace' = 'push'): void {
  if (typeof window === 'undefined') return;
  installPopStateListener();
  const next = normalize(href);
  if (next === getRoutePath()) return;

  if (mode === 'replace') {
    window.history.replaceState(
      withHistoryEntry(window.history.state, routeDepth),
      '',
      next,
    );
  } else {
    routeDepth += 1;
    window.history.pushState(
      withHistoryEntry(window.history.state, routeDepth),
      '',
      next,
    );
  }
  emit();
}

export function goBack(): boolean {
  if (typeof window === 'undefined') return false;
  installPopStateListener();
  if (routeDepth < 1) return false;
  window.history.back();
  return true;
}

export function subscribeToRoute(listener: Listener): () => void {
  installPopStateListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRoutePath(): string {
  return useSyncExternalStore(subscribeToRoute, getRoutePath, () => '/');
}
