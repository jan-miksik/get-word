/**
 * Audio prefetch utility for the learning view.
 * Injects <link rel="prefetch"> tags for upcoming words with audio.
 */

import { getArweaveGatewayUrlCandidates } from '@/lib/arweave-gateways';
import { getAudioPrefetchLimit } from '@/lib/audio-network-policy';

const PREFETCH_COUNT = 10;
const prefetchedHashes = new Set<string>();

/**
 * Prefetch audio for upcoming words.
 * Call this when the word stream is loaded or updated.
 * @param audioUrls - Array of audio URLs for upcoming words (max 10 will be prefetched)
 */
export function prefetchAudio(audioUrls: string[]): void {
  if (typeof document === "undefined") return;

  const prefetchLimit = getAudioPrefetchLimit(PREFETCH_COUNT);
  if (prefetchLimit === 0) return;

  const toPrefetch = audioUrls
    .map((url) => getArweaveGatewayUrlCandidates(url)[0])
    .filter((url): url is string => Boolean(url) && !prefetchedHashes.has(url))
    .slice(0, prefetchLimit);

  for (const url of toPrefetch) {
    prefetchedHashes.add(url);
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = url;
    link.as = "audio";
    document.head.appendChild(link);
  }
}

/**
 * Clear prefetch tracking (e.g., when categories change).
 */
export function clearPrefetchCache(): void {
  prefetchedHashes.clear();
}
