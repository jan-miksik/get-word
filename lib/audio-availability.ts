'use client';

import { getArweaveGatewayUrlCandidates } from '@/lib/arweave-gateways';

type AudioAvailabilityCacheEntry = {
  promise: Promise<string | null>;
  settled: boolean;
  value: string | null;
};

const audioAvailabilityCache = new Map<string, AudioAvailabilityCacheEntry>();

const AUDIO_CACHE_NAME = 'wordlink-active-list-audio-v1';
// Short per-gateway timeout so one slow Arweave node can't stall playback.
// AbortController gives us a hard cutoff that works on both fetch implementations.
const GATEWAY_TIMEOUT_MS = 1500;

async function checkCacheFirst(candidates: string[]): Promise<string | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    for (const candidate of candidates) {
      const hit = await cache.match(candidate);
      if (hit) return candidate;
    }
  } catch {
    // Cache API can be unavailable in private modes; fall through to network.
  }
  return null;
}

async function probeWithTimeout(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
  try {
    const headResponse = await fetch(url, { method: 'HEAD', signal: controller.signal });
    if (headResponse.ok) return true;
    if (headResponse.status === 404) return false;
    if (headResponse.status !== 405 && headResponse.status !== 501) return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }

  const getController = new AbortController();
  const getTimer = setTimeout(() => getController.abort(), GATEWAY_TIMEOUT_MS);
  try {
    const getResponse = await fetch(url, { method: 'GET', signal: getController.signal });
    return getResponse.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(getTimer);
  }
}

async function probeAudioUrl(url: string): Promise<string | null> {
  const candidates = getArweaveGatewayUrlCandidates(url);

  // 1. Cache API hit beats any network attempt.
  const cached = await checkCacheFirst(candidates);
  if (cached) return cached;

  // 2. Iterate gateway candidates with a per-attempt timeout so a single
  //    slow gateway can't block subsequent fallbacks.
  for (const candidate of candidates) {
    if (await probeWithTimeout(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function checkAudioUrlAvailable(url: string | null): Promise<boolean> {
  if (!url) return Promise.resolve(false);

  const cached = audioAvailabilityCache.get(url);
  if (cached) return cached.promise.then(Boolean);

  const entry: AudioAvailabilityCacheEntry = {
    promise: Promise.resolve(null),
    settled: false,
    value: null,
  };

  entry.promise = probeAudioUrl(url).then((playableUrl) => {
    entry.settled = true;
    entry.value = playableUrl;
    return playableUrl;
  });

  audioAvailabilityCache.set(url, entry);
  return entry.promise.then(Boolean);
}

export function getCachedAudioUrlAvailability(url: string | null): boolean | null {
  if (!url) return false;
  const cached = audioAvailabilityCache.get(url);
  if (!cached || !cached.settled) return null;
  return Boolean(cached.value);
}

export async function getPlayableAudioUrl(url: string | null): Promise<string | null> {
  if (!url) return null;

  const cached = audioAvailabilityCache.get(url);
  if (cached?.settled) return cached.value;

  if (cached) return cached.promise;

  const entry: AudioAvailabilityCacheEntry = {
    promise: Promise.resolve(null),
    settled: false,
    value: null,
  };

  entry.promise = probeAudioUrl(url).then((playableUrl) => {
    entry.settled = true;
    entry.value = playableUrl;
    return playableUrl;
  });

  audioAvailabilityCache.set(url, entry);
  return entry.promise;
}

export function clearAudioAvailabilityCache(): void {
  audioAvailabilityCache.clear();
}
