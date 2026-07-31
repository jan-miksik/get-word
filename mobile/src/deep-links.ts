const ALLOWED_HOSTS = new Set(['getword.app', 'www.getword.app']);
const MAX_SHARE_TOKEN_LENGTH = 512;

/**
 * Accept only the public share-link shape the native app knows how to render.
 * Rebuilding the path from the decoded token avoids forwarding arbitrary URL
 * data into the app's router.
 */
export function routeForAppUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  const match = /^\/join\/([^/]+)\/?$/.exec(url.pathname);
  if (!match) return null;

  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (!token || token.length > MAX_SHARE_TOKEN_LENGTH) return null;

  return `/join/${encodeURIComponent(token)}`;
}
