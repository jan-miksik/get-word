'use client';

function hasPageAudioDebugFlag(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debug') === '1';
}

function isAbsoluteLikeUrl(url: string): boolean {
  return /^(https?:)?\/\//i.test(url);
}

/**
 * Propagate page-level ?debug=1 to same-origin /api/audio requests.
 * Used only for diagnostics; Arweave gateway URLs and blob/data URLs are left alone.
 */
export function withAudioDebugParam(url: string): string {
  if (!hasPageAudioDebugFlag()) return url;

  try {
    const base =
      typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const parsed = new URL(url, base);

    if (parsed.origin !== base || !parsed.pathname.startsWith('/api/audio/')) {
      return url;
    }

    parsed.searchParams.set('debug', '1');
    if (isAbsoluteLikeUrl(url)) return parsed.toString();
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}
