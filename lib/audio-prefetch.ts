/**
 * Audio prefetch utility for the learning view.
 * Downloads upcoming clips into memory instead of relying on Safari to honor
 * HTMLMediaElement.preload, which it may reduce to metadata-only loading.
 */

import { getArweaveGatewayUrlCandidates } from '@/lib/arweave-gateways';
import { getClipForAudioUrl } from '@/lib/audio-clip-cache';
import { reportAudioStorageResponse, withAudioDebugParam } from '@/lib/audio-debug';
import { getAudioPrefetchLimit } from '@/lib/audio-network-policy';

const PREFETCH_COUNT = 4;
const MAX_RETAINED_AUDIO = 12;
const AUDIO_CACHE_NAME = 'get-word-active-list-audio-v1';

type PrefetchedAudioEntry = {
  audio: HTMLAudioElement;
  blobUrl: string | null;
  warmPromise: Promise<void>;
};

const preloadedAudio = new Map<string, PrefetchedAudioEntry>();

function getPreferredPrefetchUrl(url: string): string | null {
  const directUrl = withAudioDebugParam(url);
  const candidates = getArweaveGatewayUrlCandidates(url).map(withAudioDebugParam);
  if (candidates.includes(directUrl)) return directUrl;
  return candidates[0] ?? null;
}

async function readAudioResponse(url: string): Promise<Response | null> {
  let cache: Cache | null = null;
  if (typeof caches !== 'undefined') {
    try {
      cache = await caches.open(AUDIO_CACHE_NAME);
      const cached = await cache.match(url);
      if (cached) return cached;
    } catch {
      // Cache API is unavailable on some iOS/private/insecure contexts.
    }
  }

  // Clips generated in this browser (word chat, list editor) live in the shared
  // IndexedDB store keyed by content hash. Serving them from there is the whole
  // point for anything just generated: `/api/audio/[hash]` cannot reach a fresh
  // Arweave upload yet, so it walks every gateway before falling back to B2.
  try {
    const localClip = await getClipForAudioUrl(url);
    if (localClip && localClip.size > 0) {
      const localResponse = new Response(localClip, {
        headers: { 'Content-Type': localClip.type || 'audio/mpeg' },
      });
      if (cache) {
        void cache.put(url, localResponse.clone()).catch(() => undefined);
      }
      return localResponse;
    }
  } catch {
    // Local store unavailable — the network path below still applies.
  }

  try {
    const response = await fetch(url, {
      cache: 'force-cache',
      credentials: 'same-origin',
    });
    reportAudioStorageResponse(response, url);
    if (!response.ok) return null;

    if (cache) {
      void cache.put(url, response.clone()).catch(() => undefined);
    }
    return response;
  } catch {
    return null;
  }
}

async function warmAudio(url: string, entry: PrefetchedAudioEntry): Promise<void> {
  const fallBackToMediaPreload = () => {
    if (preloadedAudio.get(url) !== entry) return;
    entry.audio.src = url;
    entry.audio.load();
  };

  const response = await readAudioResponse(url);
  if (!response) {
    // Cross-origin fetch can be blocked even when the media element itself is
    // allowed to load. Retain the old preload path as a best-effort fallback.
    fallBackToMediaPreload();
    return;
  }

  try {
    const blob = await response.blob();
    if (blob.size === 0 || typeof URL.createObjectURL !== 'function') {
      fallBackToMediaPreload();
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    if (preloadedAudio.get(url) !== entry) {
      URL.revokeObjectURL(blobUrl);
      return;
    }

    entry.blobUrl = blobUrl;
    entry.audio.src = blobUrl;
    entry.audio.load();
  } catch {
    fallBackToMediaPreload();
  }
}

function releaseAudio(url: string, entry: PrefetchedAudioEntry): void {
  entry.audio.pause();
  entry.audio.removeAttribute('src');
  entry.audio.load();
  if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
  preloadedAudio.delete(url);
}

/**
 * Prefetch audio for upcoming words.
 * Call this when the word stream is loaded or updated.
 * @param audioUrls - Array of audio URLs for upcoming words (max 10 will be prefetched)
 */
export function prefetchAudio(audioUrls: string[]): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();

  const prefetchLimit = getAudioPrefetchLimit(PREFETCH_COUNT);
  if (prefetchLimit === 0) return Promise.resolve();

  const toPrefetch = audioUrls
    .map(getPreferredPrefetchUrl)
    .filter((url): url is string => url !== null && !preloadedAudio.has(url))
    .slice(0, prefetchLimit);

  for (const url of toPrefetch) {
    const audio = new Audio();
    audio.preload = 'auto';
    const entry: PrefetchedAudioEntry = {
      audio,
      blobUrl: null,
      warmPromise: Promise.resolve(),
    };
    preloadedAudio.set(url, entry);
    entry.warmPromise = warmAudio(url, entry);

    while (preloadedAudio.size > MAX_RETAINED_AUDIO) {
      const oldest = preloadedAudio.entries().next().value;
      if (!oldest) break;
      releaseAudio(...oldest);
    }
  }

  return Promise.all(toPrefetch.map((url) => preloadedAudio.get(url)?.warmPromise)).then(
    () => undefined,
  );
}

/** Returns a fully downloaded in-memory URL synchronously during a user tap. */
export function getPrefetchedAudioUrl(url: string | null): string | null {
  if (!url) return null;
  const preferredUrl = getPreferredPrefetchUrl(url);
  return preferredUrl ? preloadedAudio.get(preferredUrl)?.blobUrl ?? null : null;
}

/**
 * Clear prefetch tracking (e.g., when categories change).
 */
export function clearPrefetchCache(): void {
  for (const [url, entry] of [...preloadedAudio]) {
    releaseAudio(url, entry);
  }
}
