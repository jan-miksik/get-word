'use client';

import { getClip, putClip } from '@/lib/audio-clip-cache';

/**
 * Shared content-hash audio playback cache.
 *
 * In-memory object URLs make repeat playback immediate. IndexedDB keeps clips
 * warm across page opens, while `/api/audio/[hash]` remains the durable fallback.
 */
const objectUrls = new Map<string, string>();

function base64ToBlob(base64: string, contentType = 'audio/mpeg'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: contentType });
}

/** Remember bytes returned by a generation call. Best-effort, never throws. */
export function storeClipBytes(contentHash: string, base64: string): void {
  if (!contentHash || !base64 || objectUrls.has(contentHash)) return;
  try {
    const blob = base64ToBlob(base64);
    if (blob.size === 0) return;
    objectUrls.set(contentHash, URL.createObjectURL(blob));
    void putClip(contentHash, blob);
  } catch {
    // A failed cache write only costs a proxy fetch later.
  }
}

/** Forget a clip whose content no longer matches its UI row. */
export function forgetClip(contentHash: string | null | undefined): void {
  if (!contentHash) return;
  const objectUrl = objectUrls.get(contentHash);
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrls.delete(contentHash);
  }
}

/** Synchronous lookup for playback that must stay inside the original tap. */
export function getWarmedClipUrl(contentHash: string): string | null {
  return objectUrls.get(contentHash) ?? null;
}

const prefetching = new Set<string>();

/**
 * Warm reused clips as soon as their hashes are known, before the learner taps.
 * Cached hashes avoid the network; failures fall back to the proxy at playback.
 */
export async function prefetchClips(
  contentHashes: (string | null | undefined)[],
  concurrency = 3,
): Promise<void> {
  const pending = Array.from(
    new Set(
      contentHashes.filter(
        (hash): hash is string =>
          Boolean(hash) && !objectUrls.has(hash as string) && !prefetching.has(hash as string),
      ),
    ),
  );
  if (pending.length === 0) return;

  for (const hash of pending) prefetching.add(hash);

  const queue = [...pending];
  const worker = async () => {
    for (let hash = queue.shift(); hash; hash = queue.shift()) {
      try {
        const stored = await getClip(hash);
        if (stored && stored.size > 0) {
          if (!objectUrls.has(hash)) objectUrls.set(hash, URL.createObjectURL(stored));
          continue;
        }
        const response = await fetch(`/api/audio/${hash}`);
        if (!response.ok) continue;
        const blob = await response.blob();
        if (blob.size === 0) continue;
        if (!objectUrls.has(hash)) objectUrls.set(hash, URL.createObjectURL(blob));
        void putClip(hash, blob);
      } catch {
        // Playback retains its existing proxy fallback.
      } finally {
        prefetching.delete(hash);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()),
  );
}

/** Resolve the best source for components that can await before assigning src. */
export async function resolveClipUrl(contentHash: string): Promise<string> {
  const cached = objectUrls.get(contentHash);
  if (cached) return cached;

  try {
    const stored = await getClip(contentHash);
    if (stored && stored.size > 0) {
      const objectUrl = URL.createObjectURL(stored);
      objectUrls.set(contentHash, objectUrl);
      return objectUrl;
    }
  } catch {
    // Fall through to the proxy.
  }

  return `/api/audio/${contentHash}`;
}
