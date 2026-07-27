'use client';

import { getClip, putClip } from '@/lib/audio-clip-cache';

/**
 * Clip playback for the word chat's Review step.
 *
 * Freshly generated audio is durable on Arweave within the request, but the
 * gateways cannot serve it yet, so `/api/audio/[hash]` walks its gateway list,
 * times out, and falls back to the B2 mirror — audible as a delay before every
 * clip, and a wasted round trip for the server. So: keep the bytes we already
 * have, in the same content-hash-keyed IndexedDB store the list editor uses,
 * and play those. The proxy stays as the fallback for reused clips and for
 * anything the cache lost.
 */

/** In-memory object URLs for this session, so repeat plays cost nothing. */
const objectUrls = new Map<string, string>();

function base64ToBlob(base64: string, contentType = 'audio/mpeg'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: contentType });
}

/** Remember bytes returned by the generation call. Best-effort, never throws. */
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

/** Forget a clip the learner invalidated (edited target text). */
export function forgetClip(contentHash: string | null | undefined): void {
  if (!contentHash) return;
  const objectUrl = objectUrls.get(contentHash);
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrls.delete(contentHash);
  }
}

/**
 * Best source for a clip, in order: this session's object URL, the persisted
 * IndexedDB copy, then the audio proxy.
 */
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
