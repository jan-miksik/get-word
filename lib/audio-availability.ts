'use client';

import { getArweaveGatewayUrlCandidates } from '@/lib/arweave-gateways';
import { reportAudioStorageResponse, withAudioDebugParam } from '@/lib/audio-debug';
import { isAudioNetworkOffline } from '@/lib/audio-network-policy';

type AudioAvailabilityCacheEntry = {
  promise: Promise<string | null>;
  settled: boolean;
  value: string | null;
};

const audioAvailabilityCache = new Map<string, AudioAvailabilityCacheEntry>();

const AUDIO_CACHE_NAME = 'get-word-active-list-audio-v1';
// Short per-gateway timeout so one slow Arweave node can't stall playback.
// AbortController gives us a hard cutoff that works on both fetch implementations.
const GATEWAY_TIMEOUT_MS = 1500;

function getCandidateUrls(url: string): string[] {
  return getArweaveGatewayUrlCandidates(url).map(withAudioDebugParam);
}

function getCacheKey(url: string): string {
  return getCandidateUrls(url)[0] ?? url;
}

function shouldLogMissingAudioFile(): boolean {
  return typeof process !== 'undefined' && process.env['NODE_ENV'] === 'development';
}

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
    reportAudioStorageResponse(headResponse, url);
    if (headResponse.ok) return true;
    if (headResponse.status === 404) {
      if (shouldLogMissingAudioFile()) {
        console.log('[AudioAvailability] Missing audio file', {
          url,
          method: 'HEAD',
          status: headResponse.status,
        });
      }
      return false;
    }
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
    reportAudioStorageResponse(getResponse, url);
    return getResponse.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(getTimer);
  }
}

async function probeAudioUrl(url: string): Promise<string | null> {
  const candidates = getCandidateUrls(url);

  // 1. Cache API hit beats any network attempt.
  const cached = await checkCacheFirst(candidates);
  if (cached) return cached;
  if (isAudioNetworkOffline()) return null;

  // 2. Iterate gateway candidates with a per-attempt timeout so a single
  //    slow gateway can't block subsequent fallbacks.
  for (const candidate of candidates) {
    if (isAudioNetworkOffline()) return null;
    if (await probeWithTimeout(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function checkAudioUrlAvailable(url: string | null): Promise<boolean> {
  if (!url) return Promise.resolve(false);
  const cacheKey = getCacheKey(url);
  if (isAudioNetworkOffline()) {
    return checkCacheFirst(getCandidateUrls(url)).then(Boolean);
  }

  const cached = audioAvailabilityCache.get(cacheKey);
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

  audioAvailabilityCache.set(cacheKey, entry);
  return entry.promise.then(Boolean);
}

export function getCachedAudioUrlAvailability(url: string | null): boolean | null {
  if (!url) return false;
  const cached = audioAvailabilityCache.get(getCacheKey(url));
  if (!cached || !cached.settled) return null;
  return Boolean(cached.value);
}

export function getCachedPlayableAudioUrl(url: string | null): string | null {
  if (!url) return null;
  const cached = audioAvailabilityCache.get(getCacheKey(url));
  return cached?.settled ? cached.value : null;
}

export async function getPlayableAudioUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const cacheKey = getCacheKey(url);
  if (isAudioNetworkOffline()) {
    return checkCacheFirst(getCandidateUrls(url));
  }

  const cached = audioAvailabilityCache.get(cacheKey);
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

  audioAvailabilityCache.set(cacheKey, entry);
  return entry.promise;
}

export function clearAudioAvailabilityCache(): void {
  audioAvailabilityCache.clear();
}
