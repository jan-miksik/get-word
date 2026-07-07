/**
 * Pre-generate pronunciation audio for the landing-page demo words
 * (lib/landing-demo-words.ts) across all demo languages.
 *
 * For each (word, language) pair the script:
 *   1. skips it when a playable audio variant already exists in `media_assets`
 *      (any voice — the demo endpoint plays whatever variant is stored),
 *   2. otherwise synthesizes it with Google TTS using a Chirp3-HD voice for
 *      that language (deterministic per-text voice from the Chirp3-HD pool,
 *      same assignment as the list wizard's "Mix (Chirp3-HD)"), falling back
 *      to the best available voice family when Chirp3-HD doesn't cover the
 *      language yet,
 *   3. uploads it to Arweave with the object-store (B2) mirror and records the
 *      `media_assets` row — identical storage flow to the app's batch
 *      generation (features/audio/server/batch/generate-item.ts).
 *
 * Usage:
 *   pnpm demo:generate-audio                  # all demo languages
 *   pnpm demo:generate-audio -- --dry-run     # show what would be generated
 *   pnpm demo:generate-audio -- --langs=cs,vi # limit to some languages
 *   pnpm demo:generate-audio -- --force       # regenerate + upsert even if audio exists
 *   pnpm demo:generate-audio -- --repair-quiet # replace inaudible existing variants
 *
 * Requires DATABASE_URL, GOOGLE_TTS_API_KEY, ARDRIVE_TURBO_WALLET_JWK and the
 * AUDIO_OBJECT_STORE_* variables in .env.local (or the environment). Note this
 * bypasses the per-user Google TTS quota tracking — it is an operator script.
 */

import * as dotenv from "dotenv";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

dotenv.config({ path: ".env.local" });

const PROVIDER = "google_tts";
const AUDIO_FORMAT = "mp3";
const MIN_AUDIO_BYTES = 1_000;
const MIN_DURATION_SECONDS = 0.25;
const MIN_MAX_VOLUME_DB = -35;
// Whole-clip loudness. Near-silent "blip" renders (a short word the voice
// barely voiced) keep a loud transient that clears MIN_MAX_VOLUME_DB, so max
// volume alone misses them; their mean volume collapses to -35..-50 dB while
// healthy demo clips sit at -16..-26 dB.
const MIN_MEAN_VOLUME_DB = -30;

// Google TTS lists some languages under different base codes than the app.
const TTS_BASE_ALIASES: Record<string, string[]> = {
  no: ["nb", "no"],
  "zh-CN": ["cmn", "zh"],
};

// Some landing-demo clips are intentionally curated rather than purely hashed
// across the whole voice pool. Short confirmations like "yes" are especially
// sensitive to overly characterful voices, and English `en` otherwise mixes
// multiple regional voice families together.
const DEMO_VOICE_OVERRIDES: Record<string, Record<string, string>> = {
  en: {
    yes: "en-US-Neural2-F",
  },
  hi: {
    "हाँ": "hi-IN-Neural2-A",
  },
  it: {
    "sì": "it-IT-Neural2-A",
  },
  ko: {
    "네": "ko-KR-Neural2-A",
  },
};

type GoogleVoice = {
  name: string;
  languageCodes: string[];
  ssmlGender?: string;
};

function parseArgs(argv: string[]) {
  const langsArg = argv.find((arg) => arg.startsWith("--langs="));
  return {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    repairQuiet: argv.includes("--repair-quiet"),
    langs: langsArg
      ? langsArg
          .slice("--langs=".length)
          .split(",")
          .map((lang) => lang.trim())
          .filter(Boolean)
      : null,
  };
}

type AudioQuality = {
  ok: boolean;
  durationSeconds: number;
  sizeBytes: number;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  reason: string | null;
};

async function analyzeAudioQuality(audio: Buffer): Promise<AudioQuality> {
  const tmpDir = await mkdir(path.join(os.tmpdir(), "get-word-demo-audio"), { recursive: true })
    .then(() => path.join(os.tmpdir(), "get-word-demo-audio"));
  const tmpFile = path.join(tmpDir, `quality-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  await writeFile(tmpFile, audio);

  try {
    const probe = spawnSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size",
      "-of",
      "json",
      tmpFile,
    ], { encoding: "utf8" });
    const parsed = JSON.parse(probe.stdout || "{}") as {
      format?: { duration?: string; size?: string };
    };
    const durationSeconds = Number(parsed.format?.duration ?? 0);
    const sizeBytes = Number(parsed.format?.size ?? audio.byteLength);

    const ffmpeg = spawnSync("ffmpeg", [
      "-hide_banner",
      "-nostats",
      "-i",
      tmpFile,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ], { encoding: "utf8" });
    const output = `${ffmpeg.stdout}\n${ffmpeg.stderr}`;
    const meanVolumeDb = Number(output.match(/mean_volume: (-?\d+(?:\.\d+)?) dB/)?.[1]);
    const maxVolumeDb = Number(output.match(/max_volume: (-?\d+(?:\.\d+)?) dB/)?.[1]);
    const normalizedMean = Number.isFinite(meanVolumeDb) ? meanVolumeDb : null;
    const normalizedMax = Number.isFinite(maxVolumeDb) ? maxVolumeDb : null;

    const reason =
      sizeBytes < MIN_AUDIO_BYTES
        ? `too small (${sizeBytes} bytes)`
        : durationSeconds < MIN_DURATION_SECONDS
          ? `too short (${durationSeconds.toFixed(3)}s)`
          : normalizedMax === null
            ? "could not measure volume"
            : normalizedMax < MIN_MAX_VOLUME_DB
              ? `too quiet (max ${normalizedMax.toFixed(1)} dB)`
              : normalizedMean !== null && normalizedMean < MIN_MEAN_VOLUME_DB
                ? `too quiet (mean ${normalizedMean.toFixed(1)} dB)`
                : null;

    return {
      ok: reason === null,
      durationSeconds,
      sizeBytes,
      meanVolumeDb: normalizedMean,
      maxVolumeDb: normalizedMax,
      reason,
    };
  } finally {
    await rm(tmpFile, { force: true });
  }
}

function formatQuality(quality: AudioQuality): string {
  const max = quality.maxVolumeDb === null ? "n/a" : `${quality.maxVolumeDb.toFixed(1)} dB`;
  const mean = quality.meanVolumeDb === null ? "n/a" : `${quality.meanVolumeDb.toFixed(1)} dB`;
  return `${quality.durationSeconds.toFixed(3)}s, max ${max}, mean ${mean}, ${quality.sizeBytes} bytes`;
}

async function fetchGoogleVoices(apiKey: string): Promise<GoogleVoice[]> {
  const url = new URL("https://texttospeech.googleapis.com/v1/voices");
  url.searchParams.set("key", apiKey);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google TTS voices request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { voices?: GoogleVoice[] };
  return Array.isArray(data.voices) ? data.voices : [];
}

/** Preference order when a language has no Chirp3-HD voices yet. */
function voiceFamilyRank(name: string): number {
  const normalized = name.toLowerCase();
  if (normalized.includes("chirp3-hd")) return 0;
  if (normalized.includes("chirp3")) return 1;
  if (normalized.includes("chirp")) return 2;
  if (normalized.includes("neural2")) return 3;
  if (normalized.includes("wavenet")) return 4;
  if (normalized.includes("standard")) return 5;
  return 6;
}

function voicePoolForLanguage(voices: GoogleVoice[], lang: string): string[] {
  const bases = TTS_BASE_ALIASES[lang] ?? [lang.split("-")[0].toLowerCase()];
  const candidates = voices.filter((voice) =>
    voice.languageCodes?.some((code) =>
      bases.includes(code.split("-")[0].toLowerCase()),
    ),
  );
  if (candidates.length === 0) return [];

  const chirp3Hd = candidates.filter((voice) =>
    voice.name.toLowerCase().includes("chirp3-hd"),
  );
  if (chirp3Hd.length > 0) {
    return chirp3Hd.map((voice) => voice.name).sort();
  }

  const bestRank = Math.min(...candidates.map((voice) => voiceFamilyRank(voice.name)));
  return candidates
    .filter((voice) => voiceFamilyRank(voice.name) === bestRank)
    .map((voice) => voice.name)
    .sort();
}

async function fetchAudioUrl(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.1" },
    });
    if (!response.ok) return null;
    const body = Buffer.from(await response.arrayBuffer());
    return body.byteLength > 0 ? body : null;
  } catch {
    return null;
  }
}

function orderedVoiceAttempts(primary: string, pool: string[]): string[] {
  return Array.from(new Set([primary, ...pool]));
}

function getDemoVoiceOverride(lang: string, text: string): string | undefined {
  return DEMO_VOICE_OVERRIDES[lang]?.[text];
}

async function main() {
  const { dryRun, force, repairQuiet, langs } = parseArgs(process.argv.slice(2));

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_TTS_API_KEY is not set");

  // Imported after dotenv so lib modules see the loaded environment.
  const { LANDING_DEMO_WORDS } = await import("../lib/landing-demo-words");
  const { computeContentHash, googleTTS } = await import("../lib/audio");
  const { runGoogleTtsWithRetry } = await import("../lib/google-tts-rate-limit");
  const { uploadAudio, getArweaveGatewayUrl, getArweaveGatewayUrls } = await import("../lib/audio-storage");
  const {
    getActiveObjectStorageProvider,
    getAudio,
    isObjectStorageConfigured,
    objectKeyForHash,
    putAudio,
  } = await import("../lib/object-storage");
  const { findMediaVariantsByText, getVariantLookupKey, upsertMediaAsset } =
    await import("../lib/db");
  const { getPlayableAudioFields, isPlayableAudioAsset } = await import("../lib/audio-assets");
  const { resolveVoiceForText } = await import("../features/lists/audio-step/voiceMix");

  const requestedLangs = langs ?? Object.keys(LANDING_DEMO_WORDS);
  const unknown = requestedLangs.filter((lang) => !LANDING_DEMO_WORDS[lang]);
  if (unknown.length > 0) {
    throw new Error(
      `Unknown demo language(s): ${unknown.join(", ")}. ` +
        `Available: ${Object.keys(LANDING_DEMO_WORDS).join(", ")}`,
    );
  }

  if (!dryRun && !isObjectStorageConfigured()) {
    console.warn(
      "⚠ object storage mirror (AUDIO_OBJECT_STORE_*) is not configured — " +
        "audio will be Arweave-only with no B2 fallback.",
    );
  }

  console.log(`Fetching Google TTS voice list…`);
  const voices = await fetchGoogleVoices(apiKey);

  const existingByKey = await findMediaVariantsByText(
    requestedLangs.flatMap((lang) =>
      LANDING_DEMO_WORDS[lang].map((word) => ({ text: word.text, language: lang })),
    ),
  );

  let generated = 0;
  let skipped = 0;
  let noVoice = 0;
  let failed = 0;

  for (const lang of requestedLangs) {
    const pool = voicePoolForLanguage(voices, lang);
    if (pool.length === 0) {
      console.error(`✗ ${lang}: no Google TTS voice available — skipping language`);
      noVoice += LANDING_DEMO_WORDS[lang].length;
      continue;
    }
    const poolLabel = pool[0].toLowerCase().includes("chirp3-hd")
      ? `Chirp3-HD ×${pool.length}`
      : `fallback: ${pool[0]}${pool.length > 1 ? ` ×${pool.length}` : ""}`;
    console.log(`\n${lang} (${poolLabel})`);

    for (const word of LANDING_DEMO_WORDS[lang]) {
      const variants = existingByKey.get(getVariantLookupKey(word.text, lang)) ?? [];
      const playable = variants.find(isPlayableAudioAsset);

      const voiceId =
        getDemoVoiceOverride(lang, word.text) ??
        resolveVoiceForText(word.text, { mode: "mix", voiceIds: pool }, pool) ??
        pool[0];

      if (!force && playable) {
        if (!repairQuiet) {
          console.log(`  = "${word.text}" — already has playable audio, skipping`);
          skipped += 1;
          continue;
        }

        let existingAudio: Buffer | null = null;
        const objectAudio = playable.storageProvider
          ? await getAudio(playable.contentHash, playable.storageProvider)
          : await getAudio(playable.contentHash);
        if (objectAudio) existingAudio = Buffer.from(objectAudio.body);

        if (!existingAudio && playable.storageType === "arweave") {
          for (const url of getArweaveGatewayUrls(playable.storageRef)) {
            existingAudio = await fetchAudioUrl(url);
            if (existingAudio) break;
          }
        }

        if (!existingAudio) {
          const fields = getPlayableAudioFields(playable);
          for (const url of [fields.url, ...fields.arweaveUrls].filter((value): value is string => Boolean(value))) {
            existingAudio = await fetchAudioUrl(url);
            if (existingAudio) break;
          }
        }

        if (existingAudio) {
          const quality = await analyzeAudioQuality(existingAudio);
          if (quality.ok) {
            console.log(`  = "${word.text}" — existing audio OK (${formatQuality(quality)})`);
            skipped += 1;
            continue;
          }
          console.warn(`  ! "${word.text}" — existing audio ${quality.reason}; regenerating (${formatQuality(quality)})`);
        } else {
          console.warn(`  ! "${word.text}" — existing audio could not be downloaded for quality check; regenerating`);
        }
      }

      if (dryRun) {
        console.log(`  + "${word.text}" — would generate with ${voiceId}`);
        generated += 1;
        continue;
      }

      try {
        let tts: { audio: Buffer; sizeBytes: number } | null = null;
        let selectedVoiceId = voiceId;
        let selectedQuality: AudioQuality | null = null;

        for (const candidateVoiceId of orderedVoiceAttempts(voiceId, pool)) {
          const candidate = await runGoogleTtsWithRetry(() =>
            googleTTS(word.text, lang, candidateVoiceId),
          );
          if (!candidate) {
            console.warn(`  ! "${word.text}" — ${candidateVoiceId} returned no audio`);
            continue;
          }

          const quality = await analyzeAudioQuality(candidate.audio);
          if (!quality.ok) {
            console.warn(
              `  ! "${word.text}" — ${candidateVoiceId} rejected: ${quality.reason} (${formatQuality(quality)})`,
            );
            continue;
          }

          tts = candidate;
          selectedVoiceId = candidateVoiceId;
          selectedQuality = quality;
          break;
        }

        if (!tts || !selectedQuality) {
          throw new Error("No Google TTS voice produced audible demo audio");
        }

        const hash = computeContentHash(word.text, lang, PROVIDER, {
          voiceId: selectedVoiceId,
          audioFormat: AUDIO_FORMAT,
        });

        const [uploadResult, mirrorResult] = await Promise.allSettled([
          uploadAudio(tts.audio, {
            contentHash: hash,
            language: lang,
            textReference: word.text,
            provider: PROVIDER,
            voiceId: selectedVoiceId,
          }),
          putAudio(tts.audio, hash),
        ]);
        const mirrored =
          mirrorResult.status === "fulfilled" && mirrorResult.value === true;

        let storageType: "arweave" | "object_store";
        let storageProvider: "b2" | null = null;
        let storageRef: string;
        if (uploadResult.status === "fulfilled") {
          storageType = uploadResult.value.storageType;
          storageRef = uploadResult.value.storageRef;
        } else if (mirrored) {
          storageType = "object_store";
          storageProvider = getActiveObjectStorageProvider();
          storageRef = objectKeyForHash(hash);
          console.warn(
            `  ⚠ "${word.text}" — Arweave upload failed, stored as object-store only`,
          );
        } else {
          throw uploadResult.reason;
        }

        await upsertMediaAsset({
          contentHash: hash,
          storageType,
          storageProvider,
          storageRef,
          mediaType: "audio",
          language: lang,
          textReference: word.text,
          provider: PROVIDER,
          sizeBytes: tts.sizeBytes,
        });

        const location =
          storageType === "arweave"
            ? getArweaveGatewayUrl(storageRef)
            : `${storageProvider}:${storageRef}`;
        console.log(
          `  ✓ "${word.text}" — ${selectedVoiceId}${mirrored ? " (+mirror)" : ""} (${formatQuality(selectedQuality)}) → ${location}`,
        );
        generated += 1;
      } catch (err) {
        console.error(
          `  ✗ "${word.text}" — ${err instanceof Error ? err.message : err}`,
        );
        failed += 1;
      }
    }
  }

  console.log(
    `\nDone: ${generated} ${dryRun ? "to generate" : "generated"}, ` +
      `${skipped} skipped (already stored), ${noVoice} skipped (no TTS voice), ${failed} failed.`,
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
