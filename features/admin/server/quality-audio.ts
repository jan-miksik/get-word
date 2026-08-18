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
import { isPlayableAudioAsset } from '@/lib/audio-assets';
import {
  filterChirp3HdVoices,
  getGoogleVoicesForLanguage,
} from '@/lib/language-catalog';
import { pickVoiceForText } from '@/lib/tts-voice-mix';
import { generateAudioForItem } from '@/features/audio/public.server';
import {
  getPoolItems,
  type PoolItem,
} from '@/lib/db/queries/quality-pool';
import { batchLinkAudioToItems, findMediaByHash } from '@/lib/db/queries/media-assets';

export type AudioSide = 'known' | 'target';

/** What "no explicit voice" looks like to `computeContentHash` and to Google. */
const DEFAULT_VOICE_ID = 'default';

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
  /** Items left alone because they already had a playable clip. */
  keptItems: number;
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

/**
 * Which Google voice speaks this clip — or that the language has none.
 *
 * The voice treatment is the same as the list editor, the photo lab and the
 * word chat: the Chirp3-HD voices for the language, one picked
 * deterministically from the text. Deterministic matters twice — a set of
 * clips gets a mix of voices instead of one narrator, and the content hash
 * (`text + language + provider + voice`) keeps matching, so a pair the list
 * editor already recorded is found in `media_assets` here instead of being
 * synthesized again under a different voice. Before this, the pool spoke
 * everything in Google's default voice: worse to listen to, and a guaranteed
 * cache miss against the same word recorded from a list.
 *
 * `supported: false` means Google offers no voice at all for the language
 * (Māori, for one). That is worth reporting as itself — otherwise the request
 * spends a synthesis call to come back as a bare "no audio", and an editor
 * pressing the button on a whole page of such a language sees a row of
 * identical failures with no reason in them.
 *
 * An unreachable voice catalog is NOT the same answer: it degrades to the
 * default voice and lets the attempt proceed, because a fetch that failed says
 * nothing about what Google can speak.
 */
export type PoolVoiceResolution =
  | { supported: true; voiceId: string }
  | { supported: false };

export async function resolvePoolVoice(
  text: string,
  language: string,
  explicitVoiceId?: string,
): Promise<PoolVoiceResolution> {
  const explicit = explicitVoiceId?.trim();
  if (explicit) return { supported: true, voiceId: explicit };

  const catalog = await getGoogleVoicesForLanguage(language).catch(() => null);
  if (catalog === null) return { supported: true, voiceId: DEFAULT_VOICE_ID };
  if (catalog.length === 0) return { supported: false };

  return { supported: true, voiceId: pickVoiceForText(text, filterChirp3HdVoices(catalog)) };
}

/**
 * Does this side already have a clip a learner can actually hear?
 *
 * This gate exists because the action fills gaps — it must never replace a
 * recording someone already has. The admin button appears as soon as ONE
 * occurrence is missing audio, so without this check a pair that is 9/10
 * recorded would have all nine good clips overwritten to fix the tenth.
 *
 * `ready` alone is not enough. A legacy `r2` row is linked but unplayable
 * (`isPlayableAudioAsset` rejects it, the serve route 404s), and repairing
 * exactly those is half the point of the tool — so the asset is judged, not
 * just the status column. `pending` and `failed` hold nothing worth keeping.
 */
export function hasUsableAudio(item: PoolItem, side: AudioSide): boolean {
  const status = side === 'known' ? item.knownAudioStatus : item.targetAudioStatus;
  if (status !== 'ready') return false;
  return isPlayableAudioAsset(side === 'known' ? item.knownAsset : item.targetAsset);
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
      keptItems: 0,
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
      keptItems: 0,
      contentHash: null,
      error: 'Nothing to speak on this side.',
    };
  }

  const language = languageFor(items[0], side);
  const voice = await resolvePoolVoice(canonical, language, voiceId);
  if (!voice.supported) {
    return {
      generated: false,
      linkedItems: 0,
      skippedItems: 0,
      keptItems: 0,
      contentHash: null,
      error: `Google has no text-to-speech voice for "${language}".`,
    };
  }

  // The sentinel means "no explicit voice"; anything else is a real voice name.
  const namedVoice = voice.voiceId === DEFAULT_VOICE_ID ? undefined : voice.voiceId;
  const hash = computeContentHash(canonical, language, 'google_tts', {
    voiceId: voice.voiceId,
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
        voiceId: namedVoice,
      },
      {
        provider: 'google_tts',
        voiceId: namedVoice,
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
        keptItems: 0,
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
        keptItems: 0,
        contentHash: hash,
        error: 'Audio was generated but the asset could not be found.',
      };
    }
  }

  const equivalent = items.filter((item) => mayLink(textFor(item, side), canonical));
  // Fill gaps only. An item that already has a playable clip keeps it — the
  // editor is repairing missing audio, not replacing what learners have.
  const linkable = equivalent.filter((item) => !hasUsableAudio(item, side));

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
    skippedItems: items.length - equivalent.length,
    keptItems: equivalent.length - linkable.length,
    contentHash: hash,
  };
}
