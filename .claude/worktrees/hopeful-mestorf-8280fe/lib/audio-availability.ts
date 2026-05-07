'use client';

type AudioAvailabilityCacheEntry = {
  promise: Promise<boolean>;
  settled: boolean;
  value: boolean | null;
};

const audioAvailabilityCache = new Map<string, AudioAvailabilityCacheEntry>();

async function probeAudioUrl(url: string): Promise<boolean> {
  try {
    const headResponse = await fetch(url, { method: 'HEAD' });
    if (headResponse.ok) return true;
    if (headResponse.status !== 405 && headResponse.status !== 501) {
      return false;
    }
  } catch {
    // Fall through to a regular GET when HEAD is unsupported or blocked.
  }

  try {
    const getResponse = await fetch(url, { method: 'GET' });
    return getResponse.ok;
  } catch {
    return false;
  }
}

export function checkAudioUrlAvailable(url: string | null): Promise<boolean> {
  if (!url) return Promise.resolve(false);

  const cached = audioAvailabilityCache.get(url);
  if (cached) return cached.promise;

  const entry: AudioAvailabilityCacheEntry = {
    promise: Promise.resolve(false),
    settled: false,
    value: null,
  };

  entry.promise = probeAudioUrl(url).then((result) => {
    entry.settled = true;
    entry.value = result;
    return result;
  });

  audioAvailabilityCache.set(url, entry);
  return entry.promise;
}

export function getCachedAudioUrlAvailability(url: string | null): boolean | null {
  if (!url) return false;
  const cached = audioAvailabilityCache.get(url);
  if (!cached || !cached.settled) return null;
  return cached.value;
}

export function clearAudioAvailabilityCache(): void {
  audioAvailabilityCache.clear();
}
