/**
 * Generate landing demo phrase data for every app-supported learning language.
 *
 * This expands lib/landing-demo-word-data.ts from the Google-backed language
 * catalog. Existing entries are preserved unless --force is passed, so manually
 * reviewed phrases can stay stable.
 *
 * Usage:
 *   pnpm demo:generate-words
 *   pnpm demo:generate-words -- --force
 *   pnpm demo:generate-words -- --langs=sw,zu
 */

import * as dotenv from "dotenv";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  COMMON_LANGUAGES,
  GOOGLE_TRANSLATE_LANGUAGES,
  mergeLanguages,
  normalizeLanguageCode,
} from "../lib/i18n/languages";
import { LANDING_DEMO_WORD_DATA } from "../lib/landing-demo-word-data";
import { googleTranslate } from "../lib/translation";

dotenv.config({ path: ".env.local" });

const OUTPUT_PATH = path.join(process.cwd(), "lib", "landing-demo-word-data.ts");
const SOURCE_LANGUAGE = "en";
const SOURCE_TEXTS = ["yes", "I don't understand", "thank you"];
const EXCLUDED_LEARNING_LANGUAGE_CODES = new Set(["pt-PT", "zh"]);

function parseArgs(argv: string[]) {
  const langsArg = argv.find((arg) => arg.startsWith("--langs="));
  return {
    force: argv.includes("--force"),
    langs: langsArg
      ? langsArg
          .slice("--langs=".length)
          .split(",")
          .map((lang) => normalizeLanguageCode(lang.trim()))
          .filter(Boolean)
      : null,
  };
}

function resolveSupportedLanguageCodes(): string[] {
  return mergeLanguages(COMMON_LANGUAGES, GOOGLE_TRANSLATE_LANGUAGES)
    .map((language) => normalizeLanguageCode(language.code))
    .filter((code) => !EXCLUDED_LEARNING_LANGUAGE_CODES.has(code));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function googleTranslateTexts(texts: string[], fromLang: string, toLang: string) {
  const results = await googleTranslate(texts, fromLang, toLang, {
    source: "landing_demo_words_script",
  });

  // googleTranslate reports failures per item instead of throwing. Falling back
  // to `result.text` here would write the English source into the generated
  // file and exit 0, so a missing key or a Google outage would silently ship
  // untranslated demo words to the landing page. Fail the run instead.
  const failures = results.filter(
    (result) => result.status !== "ok" || !result.translated,
  );
  if (failures.length > 0) {
    const reason = failures[0].error ?? "no translation returned";
    throw new Error(
      `Google Translate failed for ${failures.length}/${results.length} texts ` +
        `(${fromLang} -> ${toLang}): ${reason}`,
    );
  }

  return results.map((result) => result.translated as string);
}

function toTs(data: Record<string, { text: string }[]>): string {
  return `import type { LandingDemoLexeme } from "@/lib/landing-demo-types";

// Generated/updated by \`pnpm demo:generate-words\`.
// Word order must match across languages.
export const LANDING_DEMO_WORD_DATA: Record<string, LandingDemoLexeme[]> = ${JSON.stringify(data, null, 2)};
`;
}

async function translateLanguage(code: string) {
  if (code === SOURCE_LANGUAGE) {
    return SOURCE_TEXTS.map((text) => ({ text }));
  }

  const translated = await googleTranslateTexts(SOURCE_TEXTS, SOURCE_LANGUAGE, code);
  return translated.map((text) => ({
    text: decodeHtmlEntities(text).trim(),
  }));
}

async function main() {
  const { force, langs } = parseArgs(process.argv.slice(2));
  const supportedCodes = resolveSupportedLanguageCodes();
  const requestedCodes = langs ?? supportedCodes;
  const supported = new Set(supportedCodes);
  const unknown = requestedCodes.filter((code) => !supported.has(code));
  if (unknown.length > 0) {
    throw new Error(
      `Unsupported demo language(s): ${unknown.join(", ")}. ` +
        `Known supported count: ${supportedCodes.length}`,
    );
  }

  const data: Record<string, { text: string }[]> = {};
  for (const code of supportedCodes) {
    const existing = LANDING_DEMO_WORD_DATA[code];
    if (existing && existing.length === SOURCE_TEXTS.length && !force) {
      data[code] = existing.map((word) => ({ text: word.text }));
    }
  }

  let generated = 0;
  let kept = 0;
  for (const code of requestedCodes) {
    if (data[code] && !force) {
      kept += 1;
      console.log(`[landing-demo-words] = ${code} existing`);
      continue;
    }

    console.log(`[landing-demo-words] + ${code}`);
    data[code] = await translateLanguage(code);
    generated += 1;
  }

  // Preserve the supported catalog order and discard entries for languages no
  // longer supported by the learning catalog.
  const ordered: Record<string, { text: string }[]> = {};
  for (const code of supportedCodes) {
    const words = data[code] ?? LANDING_DEMO_WORD_DATA[code];
    if (words) ordered[code] = words.map((word) => ({ text: word.text }));
  }

  await writeFile(OUTPUT_PATH, toTs(ordered), "utf8");
  console.log(
    `[landing-demo-words] wrote ${Object.keys(ordered).length} languages to ${OUTPUT_PATH} ` +
      `(${generated} generated, ${kept} kept)`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
