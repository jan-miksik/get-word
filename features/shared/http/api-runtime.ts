import { getDeviceId } from '@/lib/device-id';

/**
 * Single configuration point for browser → API calls.
 *
 * On the web the client is same-origin and is authenticated by the
 * `get_word_session` cookie, so both settings stay empty and every request
 * keeps using the relative URL and cookie exactly as before.
 *
 * The native iOS build is different on both counts: it runs on
 * `capacitor://localhost`, so the API is cross-origin, and it has no cookie jar
 * shared with getword.app, so it authenticates with the bearer token stored in
 * the Keychain. It configures both values once at boot.
 */
type ApiRuntime = {
  origin: string;
  readSessionToken: () => string | null;
};

const runtime: ApiRuntime = {
  origin: '',
  readSessionToken: () => null,
};

export function configureApiRuntime(next: Partial<ApiRuntime>): void {
  if (next.origin !== undefined) {
    runtime.origin = next.origin.replace(/\/+$/, '');
  }
  if (next.readSessionToken) {
    runtime.readSessionToken = next.readSessionToken;
  }
}

/** Absolute API URL for a host that is not the page's own origin. */
export function apiUrl(path: string): string {
  if (!runtime.origin || !path.startsWith('/')) return path;
  return `${runtime.origin}${path}`;
}

export function apiAuthHeaders(): Record<string, string> {
  const token = runtime.readSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isApiTarget(path: string): boolean {
  if (path.startsWith('/')) return true;
  return Boolean(runtime.origin) && path.startsWith(`${runtime.origin}/`);
}

/**
 * `fetch` for Get Word API routes. Identical to a bare `fetch` on the web apart
 * from the device header; on native it retargets the request at the API origin
 * and attaches the bearer session. Caching semantics are deliberately left
 * alone — callers that need `no-store` say so, because several of these
 * endpoints (i18n messages, language catalog) are meant to be cached.
 *
 * Some callers pass a URL that may or may not belong to this API — an audio
 * clip can live on the API or in object storage. Anything pointing elsewhere is
 * fetched untouched, so the session token is never sent to a third-party host.
 */
export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if (!isApiTarget(path)) return fetch(path, options);

  return fetch(apiUrl(path), {
    ...options,
    headers: {
      'x-device-id': getDeviceId(),
      ...apiAuthHeaders(),
      ...options.headers,
    },
  });
}
