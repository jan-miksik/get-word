/**
 * Generate a missing recording for one pool pair and share it across every
 * item that uses it.
 *
 * This is the cleanest action in the pool: `media_assets` is content-addressed,
 * so one clip fixes every occurrence at once and nobody's text is touched.
 *
 * The subtlety is which text gets spoken, and which items may then point at
 * the result — see `pickCanonicalText` and the equivalence gate below.
 */

import { computeContentHash } from '@/lib/audio';
import { isAudioTextEquivalent } from '@/lib/audio-text-match';
import { generateAudioForItem } from '@/features/audio/public.server';
import {
  getPoolItems,
  type PoolItem,
} from '@/lib/db/queries/quality-pool';
import { batchLinkAudioToItems, findMediaByHash } from '@/lib/db/queries/media-assets';

export type AudioSide = 'known' | 'target';

export interface GenerateAudioOptions {
  poolKey: string;
  side: AudioSide;
  userId: string;
  voiceId?: string;
}

export interface GenerateAudioOutcome {
  generated: boolean;
  linkedItems: number;
  /** Items under this pool key whose own text was not audio-equivalent. */
  skippedItems: number;
  contentHash: string | null;
  error?: string;
}

function textFor(item: PoolItem, side: AudioSide): string {
  return side === 'known' ? item.textKnown : item.textTarget;
}

function languageFor(item: PoolItem, side: AudioSide): string {
  return side === 'known' ? item.languageFrom : item.languageTo;
}

/**
 * The spelling to synthesize: the MODAL exact variant, preferring one without
 * a trailing dot when there is a tie.
 *
 * Not `min()` / alphabetically first — a pool row folds case, whitespace and
 * trailing dots together, so the first variant in sort order can easily be a
 * one-off typo that would then be read aloud to everyone.
 */
export function pickCanonicalText(variants: string[]): string {
  const counts = new Map<string, number>();
  for (const variant of variants) {
    counts.set(variant, (counts.get(variant) ?? 0) + 1);
  }

  let best = variants[0] ?? '';
  let bestCount = -1;
  for (const [text, count] of counts) {
    const endsWithDot = /\.$/.test(text.trim());
    const bestEndsWithDot = /\.$/.test(best.trim());
    const better =
      count > bestCount ||
      (count === bestCount && bestEndsWithDot && !endsWithDot) ||
      (count === bestCount && bestEndsWithDot === endsWithDot && text < best);
    if (better) {
      best = text;
      bestCount = count;
    }
  }
  return best;
}

/**
 * May this item point at a clip recorded from `canonical`?
 *
 * The repo's invariant is NOT "the asset's text equals the item's text" —
 * `updateItemTranslations` deliberately keeps an existing clip across cosmetic
 * edits, so an item reading "Hello." legitimately points at a clip of "Hello".
 * The rule is audio-equivalence, and `isAudioTextEquivalent` is where it is
 * defined.
 *
 * NFC is applied first because `normalizeAudioText` does not normalize Unicode
 * form, while the pool key does — so an NFD spelling shares a pool key with
 * its NFC twin but would not otherwise compare equal. Those items are left
 * unlinked rather than quietly attached to a clip of a different string.
 */
export function mayLink(itemText: string, canonical: string): boolean {
  return isAudioTextEquivalent(itemText.normalize('NFC'), canonical.normalize('NFC'));
}

export async function generatePoolAudio(
  options: GenerateAudioOptions,
): Promise<GenerateAudioOutcome> {
  const { poolKey, side, userId, voiceId } = options;

  const items = await getPoolItems(poolKey);
  if (items.length === 0) {
    return {
      generated: false,
      linkedItems: 0,
      skippedItems: 0,
      contentHash: null,
      error: 'No eligible items for this pair.',
    };
  }

  const canonical = pickCanonicalText(items.map((item) => textFor(item, side)));
  if (canonical.trim() === '') {
    return {
      generated: false,
      linkedItems: 0,
      skippedItems: items.length,
      contentHash: null,
      error: 'Nothing to speak on this side.',
    };
  }

  const language = languageFor(items[0], side);
  const hash = computeContentHash(canonical, language, 'google_tts', {
    voiceId: voiceId ?? null,
    audioFormat: 'mp3',
  });

  // Reuse before spending a TTS call: the shared pool may already hold this
  // exact clip from an unrelated list.
  let asset = await findMediaByHash(hash);

  if (!asset) {
    const { result } = await generateAudioForItem(
      {
        // A synthetic id: `linkToItem: false` means nothing is written against
        // it, and linking is done below against the items that pass the gate.
        item: { id: `pool:${poolKey}`, text: canonical, language },
        hash,
        voiceId,
      },
      {
        provider: 'google_tts',
        voiceId,
        encryptedKey: null,
        audioField: side,
        force: false,
        linkToItem: false,
        googleUsageSource: 'audio_repair',
        googleUsageUserId: userId,
      },
    );

    if (result.status !== 'ok') {
      return {
        generated: false,
        linkedItems: 0,
        skippedItems: 0,
        contentHash: hash,
        error: result.error ?? 'Audio generation failed.',
      };
    }

    asset = await findMediaByHash(hash);
    if (!asset) {
      return {
        generated: false,
        linkedItems: 0,
        skippedItems: 0,
        contentHash: hash,
        error: 'Audio was generated but the asset could not be found.',
      };
    }
  }

  const linkable = items.filter((item) => mayLink(textFor(item, side), canonical));

  await batchLinkAudioToItems(
    linkable.map((item) => ({
      itemId: item.itemId,
      audioAssetId: asset.id,
      audioStatus: 'ready' as const,
      audioField: side,
    })),
  );

  return {
    generated: true,
    linkedItems: linkable.length,
    skippedItems: items.length - linkable.length,
    contentHash: hash,
  };
}
