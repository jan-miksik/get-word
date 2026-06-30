'use client';

export const AUDIO_OBJECT_STORAGE_EVENT = 'get-word:audio-object-storage';

export type AudioObjectStorageEventDetail = {
  storage: string;
  provider?: string;
  requestedUrl?: string;
  finalUrl?: string;
};

function hasPageAudioDebugFlag(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debug') === '1';
}

function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.localhost')
  );
}

// Opt-in flag set by role-aware components (e.g. for editor users) so audio
// storage source logging stays available off-localhost without ?debug=1.
let forceAudioStorageLogging = false;

export function setAudioStorageLoggingEnabled(enabled: boolean): void {
  forceAudioStorageLogging = enabled;
}

function shouldLogAudioStorage(): boolean {
  return forceAudioStorageLogging || isLocalhost() || hasPageAudioDebugFlag();
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

type AudioStorageSource = {
  label: string;
  storage: string | null;
  provider?: string;
  gateway?: string;
};

/**
 * Describe where an /api/audio response was served from, using the storage
 * headers the route sets: X-Audio-Storage (`object` | `object-fallback`),
 * X-Audio-Storage-Provider (e.g. `b2`), and X-Audio-Gateway (Arweave proxy).
 */
function describeAudioStorageSource(response: Response): AudioStorageSource | null {
  const storage = response.headers.get('x-audio-storage');
  const provider = response.headers.get('x-audio-storage-provider') || undefined;
  const gateway = response.headers.get('x-audio-gateway') || undefined;

  if (storage === 'object') {
    return { label: `object store (${provider ?? 'unknown'})`, storage, provider };
  }
  if (storage === 'object-fallback') {
    return {
      label: `object store fallback (${provider ?? 'unknown'})`,
      storage,
      provider,
    };
  }
  if (gateway) {
    let host = gateway;
    try {
      host = new URL(gateway).host;
    } catch {
      // keep the raw gateway value
    }
    return { label: `Arweave (${host})`, storage, gateway };
  }
  return null;
}

export function reportAudioStorageResponse(
  response: Response,
  requestedUrl?: string,
): void {
  if (typeof window === 'undefined') return;

  const source = describeAudioStorageSource(response);

  // Keep the badge event for the object-store fallback path.
  if (source?.storage === 'object-fallback') {
    window.dispatchEvent(
      new CustomEvent<AudioObjectStorageEventDetail>(AUDIO_OBJECT_STORAGE_EVENT, {
        detail: {
          storage: source.storage,
          provider: source.provider,
          requestedUrl,
          finalUrl: response.url || undefined,
        },
      }),
    );
  }

  // Per-serve console line showing B2 vs Arweave. Enabled on localhost, for
  // editor users (via setAudioStorageLoggingEnabled), or with page ?debug=1.
  if (source && shouldLogAudioStorage()) {
    console.info(`[Get Word audio] served from ${source.label}`, {
      source: source.label,
      ...(source.provider ? { provider: source.provider } : {}),
      ...(source.gateway ? { gateway: source.gateway } : {}),
      url: response.url || requestedUrl,
    });
  }
}
