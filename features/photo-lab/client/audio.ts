'use client';

import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';
import type { PhotoLabLabel } from '@/features/photo-lab/types';

/**
 * `ok: false` covers technical failures (network, 5xx, malformed response) —
 * callers must NOT persist anything so the next open retries. A successful
 * response where nothing could be generated is `ok: true` with `{}`/partial
 * hashes, which IS worth persisting to avoid pointless re-requests.
 */
export type PhotoLabAudioResult =
  | { ok: true; hashes: Record<string, string> }
  | { ok: false };

// One request per session at a time; reopening history must not fan out
// duplicate generation calls.
const inFlight = new Map<string, Promise<PhotoLabAudioResult>>();
const AUDIO_REQUEST_TIMEOUT_MS = 120_000;

export function requestPhotoLabAudio(
  sessionId: string,
  labels: PhotoLabLabel[],
  language: string,
): Promise<PhotoLabAudioResult> {
  const pending = inFlight.get(sessionId);
  if (pending) return pending;

  const request = fetchAudioHashes(labels, language);
  inFlight.set(sessionId, request);
  void request.finally(() => {
    inFlight.delete(sessionId);
  });
  return request;
}

async function fetchAudioHashes(
  labels: PhotoLabLabel[],
  language: string,
): Promise<PhotoLabAudioResult> {
  const items = labels
    .map((label) => ({ id: label.id, text: label.target }))
    .filter((item) => item.text.trim().length > 0);
  if (items.length === 0) return { ok: true, hashes: {} };

  try {
    const response = await deviceJsonFetch('/api/photo-lab/audio', {
      method: 'POST',
      body: JSON.stringify({ items, language }),
      signal: AbortSignal.timeout(AUDIO_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false };
    const body = (await response.json().catch(() => null)) as {
      results?: { id?: string; hash?: string | null }[];
    } | null;
    if (!Array.isArray(body?.results)) return { ok: false };

    if (body.results.length !== items.length) return { ok: false };

    const expectedIds = new Set(items.map((item) => item.id));
    const returnedIds = new Set<string>();
    const hashes: Record<string, string> = {};
    for (const result of body.results) {
      if (
        typeof result?.id !== 'string' ||
        !expectedIds.has(result.id) ||
        returnedIds.has(result.id) ||
        (result.hash !== null && typeof result.hash !== 'string')
      ) {
        return { ok: false };
      }
      returnedIds.add(result.id);
      if (typeof result.hash === 'string' && result.hash) {
        hashes[result.id] = result.hash;
      }
    }
    return { ok: true, hashes };
  } catch {
    return { ok: false };
  }
}
