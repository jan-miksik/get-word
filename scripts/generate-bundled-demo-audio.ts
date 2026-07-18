/**
 * Bundle the canonical remote landing-demo audio into public/audio/demo.
 *
 * The local fallback files should sound exactly like the operator-generated
 * Google TTS assets stored in media_assets/Arweave/B2. This script does not use
 * macOS `say`; it downloads the newest playable saved variant for each demo
 * word and writes it to public/audio/demo/<lang>/<index>.mp3.
 *
 * Run `pnpm demo:generate-audio` first to synthesize and upload any missing
 * remote variants, then:
 *
 *   pnpm demo:generate-bundled-audio
 *   pnpm demo:generate-bundled-audio -- --langs=de,cs --force
 *
 * Requires DATABASE_URL and either AUDIO_OBJECT_STORE_* for B2 reads, or
 * network access to Arweave gateways for rows stored on Arweave.
 */

import * as dotenv from "dotenv";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  analyzeAudioBuffer,
  analyzeAudioFile,
  formatAudioQuality,
  MIN_AUDIO_BYTES,
  type AudioQuality,
} from "./lib/audio-quality";

dotenv.config({ path: ".env.local" });

const OUT_ROOT = path.join(process.cwd(), "public", "audio", "demo");
const AUDIO_LANGUAGES_OUTPUT_PATH = path.join(
  process.cwd(),
  "lib",
  "landing-demo-audio-languages.ts",
);

function parseArgs(argv: string[]) {
  const langsArg = argv.find((arg) => arg.startsWith("--langs="));
  return {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    langs: langsArg
      ? langsArg
          .slice("--langs=".length)
          .split(",")
          .map((lang) => lang.trim())
          .filter(Boolean)
      : null,
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasCompleteBundledAudio(
  lang: string,
  words: readonly { text: string }[],
): Promise<boolean> {
  for (let index = 0; index < words.length; index += 1) {
    if (!(await exists(path.join(OUT_ROOT, lang, `${index + 1}.mp3`)))) {
      return false;
    }
  }
  return true;
}

async function writeAudioLanguageCodes(allWords: Record<string, { text: string }[]>) {
  const codes: string[] = [];
  for (const [lang, words] of Object.entries(allWords)) {
    if (await hasCompleteBundledAudio(lang, words)) codes.push(lang);
  }
  codes.sort((a, b) => a.localeCompare(b));
  const source = `// Generated/updated by \`pnpm demo:generate-bundled-audio\`.
// Lists languages that currently have a complete bundled public/audio/demo set.
export const LANDING_DEMO_AUDIO_LANGUAGE_CODES = ${JSON.stringify(codes, null, 2)} as const;
`;
  await writeFile(AUDIO_LANGUAGES_OUTPUT_PATH, source, "utf8");
  console.log(
    `Updated ${AUDIO_LANGUAGES_OUTPUT_PATH} with ${codes.length} bundled audio language(s).`,
  );
}

async function assertNonEmptyAudio(filePath: string) {
  const info = await stat(filePath);
  if (info.size < MIN_AUDIO_BYTES) {
    throw new Error(`${filePath} is unexpectedly small (${info.size} bytes)`);
  }
}

async function fetchAudioUrl(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.1" },
    });
    if (!response.ok) {
      console.warn(`    - ${url} returned ${response.status} ${response.statusText}`);
      return null;
    }

    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength < MIN_AUDIO_BYTES) {
      console.warn(`    - ${url} returned only ${body.byteLength} bytes`);
      return null;
    }
    return body;
  } catch (err) {
    console.warn(`    - ${url} failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function writeAudioFile(outFile: string, audio: Buffer): Promise<AudioQuality> {
  await mkdir(path.dirname(outFile), { recursive: true });
  const tmpFile = `${outFile}.${process.pid}.tmp`;
  await writeFile(tmpFile, audio);
  await assertNonEmptyAudio(tmpFile);
  const quality = analyzeAudioFile(tmpFile);
  if (!quality.ok) {
    throw new Error(`downloaded audio is ${quality.reason} (${formatAudioQuality(quality)})`);
  }
  await rename(tmpFile, outFile);
  await assertNonEmptyAudio(outFile);
  return quality;
}

async function main() {
  const { dryRun, force, langs } = parseArgs(process.argv.slice(2));

  const { LANDING_DEMO_WORDS } = await import("../lib/landing-demo-words");
  const { getArweaveGatewayUrls } = await import("../lib/audio-storage");
  const { getAudio, isObjectStorageConfigured } = await import("../lib/object-storage");
  const { findMediaVariantsByText, getVariantLookupKey } = await import("../lib/db");
  const { isPlayableAudioAsset } = await import("../lib/audio-assets");

  const selectedLangs = langs ?? Object.keys(LANDING_DEMO_WORDS);
  const unknown = selectedLangs.filter((lang) => !LANDING_DEMO_WORDS[lang]);
  if (unknown.length > 0) {
    throw new Error(
      `Unknown demo language(s): ${unknown.join(", ")}. ` +
        `Available: ${Object.keys(LANDING_DEMO_WORDS).join(", ")}`,
    );
  }

  if (!isObjectStorageConfigured()) {
    console.warn(
      "⚠ object storage is not configured; falling back to Arweave gateway downloads.",
    );
  }

  const variantsByKey = await findMediaVariantsByText(
    selectedLangs.flatMap((lang) =>
      LANDING_DEMO_WORDS[lang].map((word) => ({ text: word.text, language: lang })),
    ),
  );

  let written = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;

  for (const lang of selectedLangs) {
    console.log(`\n${lang}`);

    for (const [index, word] of LANDING_DEMO_WORDS[lang].entries()) {
      const outFile = path.join(OUT_ROOT, lang, `${index + 1}.mp3`);
      if (!force && (await exists(outFile))) {
        console.log(`  = ${index + 1}.mp3 "${word.text}" — already bundled`);
        skipped += 1;
        continue;
      }

      const variants = variantsByKey.get(getVariantLookupKey(word.text, lang)) ?? [];
      const playable = variants.find(isPlayableAudioAsset);
      if (!playable) {
        console.warn(`  ! ${index + 1}.mp3 "${word.text}" — no playable remote asset`);
        missing += 1;
        continue;
      }

      let audio: Buffer | null = null;
      let source = "";

      const objectAudio =
        playable.storageType === "object_store" && playable.storageProvider
          ? await getAudio(playable.contentHash, playable.storageProvider)
          : await getAudio(playable.contentHash);

      if (objectAudio) {
        audio = Buffer.from(objectAudio.body);
        source = playable.storageProvider
          ? `B2 object store (${playable.storageProvider})`
          : "B2 object store";
      }

      if (!audio && playable.storageType === "arweave") {
        for (const url of getArweaveGatewayUrls(playable.storageRef)) {
          audio = await fetchAudioUrl(url);
          if (audio) {
            source = url;
            break;
          }
        }
      }

      if (!audio && /^https?:\/\//i.test(playable.storageRef)) {
        audio = await fetchAudioUrl(playable.storageRef);
        if (audio) source = playable.storageRef;
      }

      if (!audio) {
        console.warn(
          `  ✗ ${index + 1}.mp3 "${word.text}" — remote asset exists but could not be downloaded`,
        );
        failed += 1;
        continue;
      }

      try {
        if (dryRun) {
          const quality = await analyzeAudioBuffer(audio, "bundle-quality");
          if (!quality.ok) {
            throw new Error(`downloaded audio is ${quality.reason} (${formatAudioQuality(quality)})`);
          }
          console.log(
            `  + ${index + 1}.mp3 "${word.text}" — would write ${playable.provider} ${playable.contentHash} (${formatAudioQuality(quality)}) ← ${source}`,
          );
          written += 1;
          continue;
        }

        const quality = await writeAudioFile(outFile, audio);
        console.log(
          `  ✓ ${index + 1}.mp3 "${word.text}" — ${playable.provider} ${playable.contentHash} (${formatAudioQuality(quality)}) ← ${source}`,
        );
        written += 1;
      } catch (err) {
        await unlink(`${outFile}.${process.pid}.tmp`).catch(() => undefined);
        console.warn(
          `  ✗ ${index + 1}.mp3 "${word.text}" — ${err instanceof Error ? err.message : err}`,
        );
        failed += 1;
      }
    }
  }

  console.log(
    `\nDone: ${written} written, ${skipped} skipped, ${missing} missing remote assets, ${failed} failed.`,
  );

  if (missing > 0) {
    console.log(
      "Some languages have no remote demo audio. Run `pnpm demo:generate-audio` to generate all Google TTS-supported languages, then rerun this script with `--force`.",
    );
  }
  if (failed > 0) process.exitCode = 1;
  if (!dryRun && failed === 0) {
    await writeAudioLanguageCodes(LANDING_DEMO_WORDS);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
