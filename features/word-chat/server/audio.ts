import {
  countGoogleApiTextUnits,
  findMediaByHashes,
  reserveGoogleApiUsage,
} from "@/lib/db";
import { computeContentHash } from "@/lib/audio";
import { isPlayableAudioAsset } from "@/lib/audio-assets";
import { generateAudioForItem } from "@/features/audio/server/batch/generate-item";
import { AUDIO_FORMAT, INLINE_TOTAL_MAX_BYTES } from "@/features/audio/server/batch/types";
import { getGoogleChirp3HdVoices } from "@/lib/language-catalog";
import { pickVoiceForText } from "@/lib/tts-voice-mix";
import { MAX_ITEMS_PER_SESSION } from "./config";

/**
 * Audio for a word-chat session, generated during Review — before the items
 * exist in the database.
 *
 * The normal audio route is item-id based and authorizes against the item's
 * list, which cannot work here: there is no list yet, and creating one early
 * would break the "commit is the only user-visible write" rule. So this
 * generates straight into the content-addressed `media_assets` pool and returns
 * asset ids; commit attaches them.
 *
 * If the learner abandons Review, the worst outcome is an unreferenced asset —
 * reusable by content hash for the next person who needs the same clip, and
 * cleanable later. That is a better trade than a half-created list.
 */

const PROVIDER = "google_tts";

/**
 * What "no explicit voice" looks like inside a content hash. The list editor and
 * the photo lab both hash the literal string "default", so word chat must too —
 * a different sentinel would silently fork the cache and re-synthesize clips
 * that already exist.
 */
const DEFAULT_VOICE_SENTINEL = "default";

export type WordChatAudioRequest = {
  /** Stable index the caller uses to match results back to its rows. */
  key: string;
  text: string;
  language: string;
};

export type WordChatAudioResult = {
  key: string;
  status: "ok" | "error" | "skipped";
  assetId?: string;
  /**
   * Content hash of the clip. The asset id is what commit stores, but playback
   * goes through `/api/audio/[hash]`, which resolves by hash — returning only
   * the id gives the Review step a play button that 404s.
   */
  contentHash?: string;
  /**
   * The bytes we just synthesized, base64. Present only for a clip generated in
   * this request and only while it is small enough to inline.
   *
   * This is what makes Review play instantly: a fresh Arweave upload is not
   * servable from the gateways for a while, so `/api/audio/[hash]` walks the
   * gateway list, times out, and only then falls back to the B2 mirror — a
   * second or more of silence per clip, every clip. Handing the browser the
   * bytes skips the round trip entirely, exactly as the list editor does.
   */
  audioBase64?: string;
  error?: string;
};

/**
 * Generate (or reuse) one clip per request.
 *
 * Content-hash reuse comes first: the same sentence in the same language and
 * voice already exists for anyone who studied it before, so most sessions after
 * the first pay for very little.
 */
export async function generateWordChatAudio(input: {
  userId: string;
  items: WordChatAudioRequest[];
  /** Force one voice for the whole batch. Unset means the Chirp3-HD mix. */
  voiceId?: string;
}): Promise<{ results: WordChatAudioResult[]; quotaExhausted?: string }> {
  const items = input.items
    .map((item) => ({ ...item, text: item.text.trim() }))
    .filter((item) => item.text && item.language)
    .slice(0, MAX_ITEMS_PER_SESSION * 2);
  if (items.length === 0) return { results: [] };

  // Same voice treatment as the list editor and the photo lab: all Chirp3-HD
  // voices for the language, assigned per text so a set is read by several
  // voices instead of one. The assignment is deterministic, so the content hash
  // still matches an existing clip and a mix costs no extra synthesis. An
  // unavailable voice catalog degrades to Google's default voice.
  const forcedVoiceId = input.voiceId?.trim();
  const voicesByLanguage = new Map<string, string[]>();
  if (!forcedVoiceId) {
    const languages = [...new Set(items.map((item) => item.language))];
    const voiceLists = await Promise.all(
      languages.map((language) => getGoogleChirp3HdVoices(language).catch(() => [])),
    );
    languages.forEach((language, index) => voicesByLanguage.set(language, voiceLists[index]));
  }

  const voiceForItem = (item: WordChatAudioRequest): string =>
    forcedVoiceId || pickVoiceForText(item.text, voicesByLanguage.get(item.language) ?? []);

  const voiceIds = items.map(voiceForItem);
  const hashes = items.map((item, index) =>
    // `audioFormat` belongs in the hash: the editor and the photo lab include it,
    // and leaving it out here would give the same clip two different hashes and
    // defeat reuse between the paths.
    computeContentHash(item.text, item.language, PROVIDER, {
      voiceId: voiceIds[index],
      audioFormat: AUDIO_FORMAT,
    }),
  );
  const existing = await findMediaByHashes([...new Set(hashes)]);

  const results: WordChatAudioResult[] = [];
  const pending: { item: WordChatAudioRequest; hash: string; voiceId: string }[] = [];

  items.forEach((item, index) => {
    const hash = hashes[index];
    const asset = existing.get(hash);
    if (asset && isPlayableAudioAsset(asset)) {
      results.push({ key: item.key, status: "ok", assetId: asset.id, contentHash: hash });
      return;
    }
    pending.push({ item, hash, voiceId: voiceIds[index] });
  });

  if (pending.length === 0) return { results };

  // Only unseen text costs Google quota.
  const quota = await reserveGoogleApiUsage({
    userId: input.userId,
    scope: "tts",
    units: countGoogleApiTextUnits(pending.map((entry) => entry.item.text)),
    requestCount: pending.length,
  });
  if (!quota.allowed) {
    for (const entry of pending) {
      results.push({ key: entry.item.key, status: "skipped", error: quota.message });
    }
    return { results, quotaExhausted: quota.message };
  }

  let quotaExhausted: string | undefined;

  for (const entry of pending) {
    if (quotaExhausted) {
      results.push({ key: entry.item.key, status: "skipped", error: quotaExhausted });
      continue;
    }
    const { result, quotaExhausted: exhausted } = await generateAudioForItem(
      {
        item: {
          // `generateAudioForItem` only echoes this id back in its result; no row
          // is touched, and commit does the linking later.
          id: entry.item.key,
          text: entry.item.text,
          language: entry.item.language,
        },
        hash: entry.hash,
        voiceId: entry.voiceId,
      },
      {
        provider: PROVIDER,
        // The sentinel means "no explicit voice"; anything else is a real
        // Chirp3-HD voice name.
        voiceId: entry.voiceId === DEFAULT_VOICE_SENTINEL ? undefined : entry.voiceId,
        encryptedKey: null,
        audioField: "target",
        force: false,
        // Word-chat review rows are still drafts; commit links the returned
        // asset id after the learner confirms the whole set.
        linkToItem: false,
      },
    );
    if (exhausted) quotaExhausted = exhausted;

    if (result.status === "ok") {
      const asset = (await findMediaByHashes([entry.hash])).get(entry.hash);
      results.push(
        asset
          ? {
              key: entry.item.key,
              status: "ok",
              assetId: asset.id,
              contentHash: entry.hash,
              ...(result.audioBase64 ? { audioBase64: result.audioBase64 } : {}),
            }
          : { key: entry.item.key, status: "error", error: "Audio was not stored." },
      );
    } else {
      results.push({
        key: entry.item.key,
        status: "error",
        error: result.error ?? "Audio generation failed.",
      });
    }
  }

  // Same whole-response budget the list editor uses: inline in order until it is
  // spent, then let the rest come through the audio proxy. Thirty clips of
  // inlined mp3 would otherwise make one very large JSON response.
  let inlineBudget = INLINE_TOTAL_MAX_BYTES;
  for (const result of results) {
    if (!result.audioBase64) continue;
    // base64 is 4 bytes per 3 bytes of audio; close enough for a budget.
    const approximateBytes = Math.ceil((result.audioBase64.length * 3) / 4);
    if (approximateBytes <= inlineBudget) {
      inlineBudget -= approximateBytes;
    } else {
      delete result.audioBase64;
    }
  }

  return { results, ...(quotaExhausted ? { quotaExhausted } : {}) };
}
