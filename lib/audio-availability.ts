'use client';

type AudioAvailabilityCacheEntry = {
  promise: Promise<boolean>;
  settled: boolean;
  value: boolean | null;
};

const audioAvailabilityCache = new Map<string, AudioAvailabilityCacheEntry>();

function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

function logMissingAudio(url: string, details: Record<string, unknown>): void {
  if (!isDevelopment()) return;
  console.log('[AudioAvailability] Missing audio file', {
    url,
    ...details,
  });
}

async function probeAudioUrl(url: string): Promise<boolean> {
  try {
    const headResponse = await fetch(url, { method: 'HEAD' });
    if (headResponse.ok) return true;
    if (headResponse.status === 404) {
      logMissingAudio(url, { method: 'HEAD', status: headResponse.status });
      return false;
    }
    if (headResponse.status !== 405 && headResponse.status !== 501) {
      return false;
    }
  } catch {
    if (isDevelopment()) {
      console.log('[AudioAvailability] Failed to probe audio file', {
        url,
        method: 'HEAD',
      });
    }
    return false;
  }

  try {
    const getResponse = await fetch(url, { method: 'GET' });
    if (!getResponse.ok && getResponse.status === 404) {
      logMissingAudio(url, { method: 'GET', status: getResponse.status });
    }
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

export async function getPlayableAudioUrl(url: string | null): Promise<string | null> {
  if (!url) return null;

  const cachedAvailability = getCachedAudioUrlAvailability(url);
  if (cachedAvailability === true) return url;
  if (cachedAvailability === false) return null;

  return (await checkAudioUrlAvailable(url)) ? url : null;
}

export function clearAudioAvailabilityCache(): void {
  audioAvailabilityCache.clear();
}
