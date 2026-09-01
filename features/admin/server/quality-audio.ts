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

/**
 * Which voice to record with.
 *
 * `auto` is the deterministic Chirp3-HD pick — the same text always maps to
 * the same voice, which is what keeps the content hash reusable across the
 * list editor, the photo lab and here.
 *
 * That determinism is exactly why re-recording needs the other two. Asking
 * again for the same text under `auto` produces the same hash, finds the same
 * asset and changes nothing audible. `random` picks a Chirp3-HD voice at
 * random, avoiding the ones the pair already uses, so "record it again" gives
 * a genuinely different reading; `explicit` lets the editor name the voice.
 */
export type PoolVoiceChoice =
  | { kind: 'auto' }
  | { kind: 'random' }
  | { kind: 'explicit'; voiceId: string };

/**
 * `fill` records only where a clip is missing — the original behaviour, and
 * the only safe one for a bulk run.
 *
 * `replace` relinks every equivalent item, including the ones that already
 * have a playable clip. It changes what learners hear, so it is a deliberate
 * per-pair action, never a side effect of filling gaps.
 */
export type AudioMode = 'fill' | 'replace';

export interface GenerateAudioOptions {
  poolKey: string;
  side: AudioSide;
  userId: string;
  mode?: AudioMode;
  voice?: PoolVoiceChoice;
}

export interface GenerateAudioOutcome {
  generated: boolean;
  linkedItems: number;
  /** Of `linkedItems`, how many had a playable clip that was swapped out. */
  replacedItems: number;
  /** Items under this pool key whose own text was not audio-equivalent. */
  skippedItems: number;
  /** Items left alone because they already had a playable clip. */
  keptItems: number;
  contentHash: string | null;
  /** The voice that was actually used, for the history entry. */
  voiceId: string | null;
  error?: string;
}

function textFor(item: PoolItem, side: AudioSide): string {
  return side === 'known' ? item.textKnown : item.textTarget;
}

function languageFor(item: PoolItem, side: AudioSide): string {
  return side === 'known' ? item.languageFrom : item.languageTo;
}

function assetFor(item: PoolItem, side: AudioSide) {
  return side === 'known' ? item.knownAsset : item.targetAsset;
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
 *
 * `avoid` only applies to a random pick: it holds the voices the pair is
 * already recorded in, so pressing "record again" twice does not land on the
 * same narrator. When avoiding them would leave nothing, the full set is used
 * — a language with one Chirp3-HD voice still gets recorded.
 */
export type PoolVoiceResolution =
  | { supported: true; voiceId: string }
  | { supported: false };

export async function resolvePoolVoice(
  text: string,
  language: string,
  choice: PoolVoiceChoice = { kind: 'auto' },
  avoid: (string | null)[] = [],
): Promise<PoolVoiceResolution> {
  if (choice.kind === 'explicit') {
    const explicit = choice.voiceId.trim();
    if (explicit) return { supported: true, voiceId: explicit };
  }

  const catalog = await getGoogleVoicesForLanguage(language).catch(() => null);
  if (catalog === null) return { supported: true, voiceId: DEFAULT_VOICE_ID };
  if (catalog.length === 0) return { supported: false };

  const chirp3Hd = filterChirp3HdVoices(catalog);
  if (choice.kind !== 'random') {
    return { supported: true, voiceId: pickVoiceForText(text, chirp3Hd) };
  }

  // Chirp3-HD is the mix the rest of the app records in; fall back to the whole
  // catalog only for a language that has none of them.
  const pool = chirp3Hd.length > 0 ? chirp3Hd : catalog;
  const used = new Set(avoid.filter((voice): voice is string => Boolean(voice)));
  const candidates = pool.filter((voice) => !used.has(voice));
  const from = candidates.length > 0 ? candidates : pool;

  return { supported: true, voiceId: from[Math.floor(Math.random() * from.length)] };
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
  const { poolKey, side, userId } = options;
  const mode: AudioMode = options.mode ?? 'fill';
  const choice: PoolVoiceChoice = options.voice ?? { kind: 'auto' };

  const items = await getPoolItems(poolKey);
  if (items.length === 0) {
    return {
      generated: false,
      linkedItems: 0,
      replacedItems: 0,
      skippedItems: 0,
      keptItems: 0,
      contentHash: null,
      voiceId: null,
      error: 'No eligible items for this pair.',
    };
  }

  const canonical = pickCanonicalText(items.map((item) => textFor(item, side)));
  if (canonical.trim() === '') {
    return {
      generated: false,
      linkedItems: 0,
      replacedItems: 0,
      skippedItems: items.length,
      keptItems: 0,
      contentHash: null,
      voiceId: null,
      error: 'Nothing to speak on this side.',
    };
  }

  const language = languageFor(items[0], side);
  const currentVoices = items.map((item) => assetFor(item, side)?.voiceId ?? null);
  const voice = await resolvePoolVoice(canonical, language, choice, currentVoices);
  if (!voice.supported) {
    return {
      generated: false,
      linkedItems: 0,
      replacedItems: 0,
      skippedItems: 0,
      keptItems: 0,
      contentHash: null,
      voiceId: null,
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
        replacedItems: 0,
        skippedItems: 0,
        keptItems: 0,
        contentHash: hash,
        voiceId: voice.voiceId,
        error: result.error ?? 'Audio generation failed.',
      };
    }

    asset = await findMediaByHash(hash);
    if (!asset) {
      return {
        generated: false,
        linkedItems: 0,
        replacedItems: 0,
        skippedItems: 0,
        keptItems: 0,
        contentHash: hash,
        voiceId: voice.voiceId,
        error: 'Audio was generated but the asset could not be found.',
      };
    }
  }

  const equivalent = items.filter((item) => mayLink(textFor(item, side), canonical));
  // `fill` repairs missing audio: an item that already has a playable clip
  // keeps it. `replace` is the editor deciding the existing recording is not
  // good enough, so it relinks those too — the one path in the pool that
  // changes what a learner already hears.
  const linkable =
    mode === 'replace' ? equivalent : equivalent.filter((item) => !hasUsableAudio(item, side));
  const replaced = linkable.filter((item) => hasUsableAudio(item, side));

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
    replacedItems: replaced.length,
    skippedItems: items.length - equivalent.length,
    keptItems: equivalent.length - linkable.length,
    contentHash: hash,
    voiceId: voice.voiceId,
  };
}
