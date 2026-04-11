'use client';

const audioAvailabilityCache = new Map<string, Promise<boolean>>();

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
  if (cached) return cached;

  const probe = probeAudioUrl(url);
  audioAvailabilityCache.set(url, probe);
  return probe;
}

export function clearAudioAvailabilityCache(): void {
  audioAvailabilityCache.clear();
}
