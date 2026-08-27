import { generateAudio } from './api';
import { storeClipBytes } from './clip-playback';

/** Both identifiers of one generated clip: the id is saved, the hash is played. */
export type GeneratedClip = { assetId: string; contentHash: string | null };

/**
 * Generate a batch and retry only rows that may recover.
 *
 * Successful and quota-skipped rows leave the pending set; explicit failures
 * and rows omitted from a partial response are retried. Fresh bytes are cached
 * immediately so Review does not wait for the remote asset gateway.
 */
export async function generateAudioWithRetries(
  items: { key: string; text: string; language: string }[],
  maxAttempts = 3,
): Promise<Map<string, GeneratedClip>> {
  const assets = new Map<string, GeneratedClip>();
  let pending = [...items];

  for (let attempt = 0; attempt < maxAttempts && pending.length > 0; attempt += 1) {
    const response = await generateAudio({ items: pending }).catch(() => null);
    if (!response) continue;

    const finishedKeys = new Set<string>();
    for (const result of response.results) {
      if (result.status === 'ok' && result.asset_id) {
        assets.set(result.key, {
          assetId: result.asset_id,
          contentHash: result.content_hash,
        });
        if (result.content_hash && result.audio_base64) {
          storeClipBytes(result.content_hash, result.audio_base64);
        }
        finishedKeys.add(result.key);
      } else if (result.status === 'skipped') {
        // Usually quota exhaustion. Retrying cannot create the clip.
        finishedKeys.add(result.key);
      }
    }
    if (response.quota_exhausted) break;
    pending = pending.filter((item) => !finishedKeys.has(item.key));
  }

  return assets;
}
