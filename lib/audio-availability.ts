'use client';

import { getArweaveGatewayUrlCandidates } from '@/lib/arweave-gateways';

type AudioAvailabilityCacheEntry = {
  promise: Promise<string | null>;
  settled: boolean;
  value: string | null;
};

const audioAvailabilityCache = new Map<string, AudioAvailabilityCacheEntry>();

async function probeSingleAudioUrl(url: string): Promise<boolean> {
  try {
    const headResponse = await fetch(url, { method: 'HEAD' });
    if (headResponse.ok) return true;
    if (headResponse.status === 404) {
      return false;
    }
    if (headResponse.status !== 405 && headResponse.status !== 501) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    const getResponse = await fetch(url, { method: 'GET' });
    return getResponse.ok;
  } catch {
    return false;
  }
}

async function probeAudioUrl(url: string): Promise<string | null> {
  const candidates = getArweaveGatewayUrlCandidates(url);

  for (const candidate of candidates) {
    if (await probeSingleAudioUrl(candidate)) {
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
