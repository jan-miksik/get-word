import {
  callOpenRouterChatParsed,
  OpenRouterChatError,
  parseJsonLoose,
} from "@/lib/openrouter-chat";
import {
  LIST_GENERATION_RULES,
  TRANSLATION_QUALITY_RULES,
  TRANSLATION_SYSTEM_PROMPT,
} from "@/lib/translation-prompt";
import { looksUntranslated, validateTranslation } from "@/lib/translation-validate";
import type { WordList } from "@/lib/db/schema";
import {
  DEFAULT_LLM_ITEM_COUNT,
  MAX_GENERATED_ITEMS,
  MAX_PROMPT_CHARS,
  OPENROUTER_API_URL,
  OPENROUTER_BATCH_SIZE,
  OPENROUTER_MAX_ATTEMPTS,
  OPENROUTER_RETRY_BASE_DELAY_MS,
  SERVER_AUTOGENERATE_MODEL,
  SERVER_AUTOGENERATE_REPAIR_MODEL,
} from "./config";
import { cleanCategory, cleanText } from "./helpers";
import type { GeneratedCommonItem } from "./types";

// Re-exported for callers that catch generation failures (e.g. categories.ts).
export { OpenRouterChatError } from "@/lib/openrouter-chat";

export type SeedSourceItem = {
  sourceIndex: number;
  source: string;
  category: string;
};

const SYSTEM_MESSAGE = `${TRANSLATION_SYSTEM_PROMPT}\nYou create high-quality beginner word lists for a language-learning app.`;

function extractItemsArray(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  return Array.isArray((value as { items?: unknown }).items)
    ? (value as { items: unknown[] }).items
    : [];
}

// From-scratch generation: no source to align to, so dedupe on the produced
// pair to avoid repeats.
function parseNewListItems(value: unknown): GeneratedCommonItem[] {
  const result: GeneratedCommonItem[] = [];
  const seen = new Set<string>();
  for (const item of extractItemsArray(value)) {
    if (!item || typeof item !== "object") continue;
    const known = cleanText((item as { known?: unknown }).known);
    const target = cleanText((item as { target?: unknown }).target);
    if (!known || !target) continue;
    const key = `${known.toLowerCase()}\u0000${target.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      known,
      target,
      category: cleanCategory((item as { category?: unknown }).category),
    });
    if (result.length >= MAX_GENERATED_ITEMS) break;
  }
  return result;
}

// Seed-based generation: align every produced row back to its origin item by
// sourceIndex. We do NOT dedupe — two source concepts may legitimately share a
// translation, and dropping rows would desync the downstream positional mapping
// of audio/notes/category. Invalid or out-of-range indexes are discarded.
function parseSeedItems(
  value: unknown,
  expected: Set<number>,
): GeneratedCommonItem[] {
  const result: GeneratedCommonItem[] = [];
  const seen = new Set<number>();
  for (const item of extractItemsArray(value)) {
    if (!item || typeof item !== "object") continue;
    const rawIndex = (item as { sourceIndex?: unknown }).sourceIndex;
    if (typeof rawIndex !== "number" || !Number.isInteger(rawIndex)) continue;
    if (!expected.has(rawIndex) || seen.has(rawIndex)) continue;
    const known = cleanText((item as { known?: unknown }).known);
    const target = cleanText((item as { target?: unknown }).target);
    if (!known || !target) continue;
    seen.add(rawIndex);
    result.push({
      sourceIndex: rawIndex,
      known,
      target,
      category: cleanCategory((item as { category?: unknown }).category),
    });
  }
  return result;
}

function assertPromptWithinLimit(prompt: string) {
  if (prompt.length > MAX_PROMPT_CHARS) {
    // Silent truncation would corrupt the JSON the model sees; surface a config
    // error instead (reduce OPENROUTER_BATCH_SIZE).
    throw new OpenRouterChatError(
      `Prompt exceeds ${MAX_PROMPT_CHARS} chars; reduce OPENROUTER_BATCH_SIZE.`,
      false,
    );
  }
  return prompt;
}

function serverChatOptions(prompt: string, model = SERVER_AUTOGENERATE_MODEL) {
  const apiKey = process.env.OPENROUTER_SERVER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterChatError("OpenRouter server key is not configured.", false);
  }
  return {
    apiKey,
    model,
    apiUrl: OPENROUTER_API_URL,
    maxAttempts: OPENROUTER_MAX_ATTEMPTS,
    retryBaseDelayMs: OPENROUTER_RETRY_BASE_DELAY_MS,
    responseFormat: { type: "json_object" as const },
    // Sized for the larger OPENROUTER_BATCH_SIZE: output is ~as large as input
    // (one target per item), so this must comfortably exceed a full batch of
    // rows to avoid mid-array truncation (which would invalidate the JSON).
    maxTokens: 24_000,
    temperature: 0.2,
    messages: [
      { role: "system" as const, content: SYSTEM_MESSAGE },
      { role: "user" as const, content: assertPromptWithinLimit(prompt) },
    ],
  };
}

/**
 * Server-key JSON call used for short auxiliary prompts (e.g. category titles).
 * Retries transient failures and returns parsed JSON.
 */
export async function callOpenRouterJson(prompt: string): Promise<unknown> {
  return callOpenRouterChatParsed(serverChatOptions(prompt), (content) => {
    const parsed = parseJsonLoose(content);
    if (parsed == null) {
      throw new OpenRouterChatError("OpenRouter returned invalid JSON.", true);
    }
    return parsed;
  });
}

function buildSeedPrompt(input: {
  languageFrom: string;
  languageTo: string;
  sourceLanguage: string;
  sourceList: WordList;
  items: SeedSourceItem[];
}) {
  return `
Create a common beginner word list for ${input.languageFrom} -> ${input.languageTo}.

Use the seed list "${input.sourceList.name}" as the source concept inventory. The "source" field of each item is written in ${input.sourceLanguage}.

Rules:
${TRANSLATION_QUALITY_RULES}
${LIST_GENERATION_RULES}
- Return EXACTLY ONE item for every input item and echo its "sourceIndex" unchanged.
- Do not skip, merge, reorder, deduplicate, or invent items.
- "known" must be in ${input.languageFrom} only; "target" must be in ${input.languageTo} only.

Return JSON with this exact shape:
{
  "items": [
    { "sourceIndex": 0, "known": "word in ${input.languageFrom}", "target": "word in ${input.languageTo}", "category": "short category name" }
  ]
}

Source items:
${JSON.stringify(input.items)}
`.trim();
}

function buildNewListPrompt(languageFrom: string, languageTo: string, count: number) {
  return `
Create a common beginner word list for ${languageFrom} -> ${languageTo}.

Generate ${count} useful everyday entries across greetings, people, home, food, travel, time, numbers, feelings, verbs, adjectives, questions, and practical phrases.

Rules:
${TRANSLATION_QUALITY_RULES}
${LIST_GENERATION_RULES}
- Avoid duplicates, proper names, and long explanations.
- "known" must be in ${languageFrom} only; "target" must be in ${languageTo} only.

Return JSON with this exact shape:
{
  "items": [
    { "known": "word in ${languageFrom}", "target": "word in ${languageTo}", "category": "short category name" }
  ]
}
`.trim();
}

function buildRepairPrompt(languageFrom: string, languageTo: string, items: { index: number; source: string }[]) {
  return `
Translate these ${items.length} beginner words from ${languageFrom} to ${languageTo}.

Rules:
${TRANSLATION_QUALITY_RULES}
- The translation MUST be written in ${languageTo}'s native script, never romanization or ${languageFrom}.
- Echo each item's "index" unchanged.

Return JSON with this exact shape:
{ "items": [ { "index": 0, "target": "translation in ${languageTo}" } ] }

Items:
${JSON.stringify(items)}
`.trim();
}

function buildKnownSideRepairPrompt(input: {
  languageFrom: string;
  languageTo: string;
  sourceLanguage: string;
  items: Array<{
    index: number;
    source: string;
    currentKnown: string;
    currentTarget: string;
    category: string;
  }>;
}) {
  return `
Repair these beginner word-list rows.

Each row's "source" is the actual concept to translate from ${input.sourceLanguage}.
The current "known" field may accidentally contain the category label. Do not translate or copy the category as the word/phrase.

Rules:
${TRANSLATION_QUALITY_RULES}
- "known" must be the ${input.languageFrom} translation of "source".
- "target" must be the ${input.languageTo} translation of "source".
- Echo each item's "index" unchanged.

Return JSON with this exact shape:
{ "items": [ { "index": 0, "known": "translation in ${input.languageFrom}", "target": "translation in ${input.languageTo}" } ] }

Items:
${JSON.stringify(input.items)}
`.trim();
}

function normalizedGeneratedText(value: string | null | undefined) {
  return cleanText(value).toLowerCase();
}

function findKnownSideLeakIndexes(items: GeneratedCommonItem[]) {
  const indexes = new Set<number>();
  const byKnown = new Map<string, GeneratedCommonItem[]>();

  items.forEach((item) => {
    const known = normalizedGeneratedText(item.known);
    if (!known) return;
    if (known === normalizedGeneratedText(item.category ?? "")) {
      indexes.add(item.sourceIndex ?? -1);
    }
    byKnown.set(known, [...(byKnown.get(known) ?? []), item]);
  });

  for (const rows of byKnown.values()) {
    const targets = new Set(rows.map((row) => normalizedGeneratedText(row.target)).filter(Boolean));
    if (rows.length > 1 && targets.size > 1) {
      for (const row of rows) indexes.add(row.sourceIndex ?? -1);
    }
  }

  indexes.delete(-1);
  return indexes;
}

async function repairKnownSideLeaks(
  items: GeneratedCommonItem[],
  input: {
    languageFrom: string;
    languageTo: string;
    sourceLanguage: string;
    sourceItems: SeedSourceItem[];
  },
): Promise<GeneratedCommonItem[]> {
  const flaggedIndexes = findKnownSideLeakIndexes(items);
  if (flaggedIndexes.size === 0) return items;

  const sourceByIndex = new Map(input.sourceItems.map((item) => [item.sourceIndex, item]));
  const flagged = items
    .map((item, index) => ({ index, item, source: sourceByIndex.get(item.sourceIndex ?? -1) }))
    .filter(({ item, source }) => source && flaggedIndexes.has(item.sourceIndex ?? -1));
  if (flagged.length === 0) return items;

  console.warn("[Get Word onboarding] repairing likely category leakage in known-side translations", {
    flagged: flagged.length,
    total: items.length,
    languageFrom: input.languageFrom,
    languageTo: input.languageTo,
    repairModel: SERVER_AUTOGENERATE_REPAIR_MODEL,
  });

  try {
    const prompt = buildKnownSideRepairPrompt({
      languageFrom: input.languageFrom,
      languageTo: input.languageTo,
      sourceLanguage: input.sourceLanguage,
      items: flagged.map(({ index, item, source }) => ({
        index,
        source: source!.source,
        currentKnown: item.known,
        currentTarget: item.target,
        category: source!.category,
      })),
    });
    const byIndex = await callOpenRouterChatParsed(
      serverChatOptions(prompt, SERVER_AUTOGENERATE_REPAIR_MODEL),
      (content) => {
        const map = new Map<number, { known: string; target: string }>();
        for (const row of extractItemsArray(parseJsonLoose(content))) {
          if (!row || typeof row !== "object") continue;
          const idx = (row as { index?: unknown }).index;
          const known = cleanText((row as { known?: unknown }).known);
          const target = cleanText((row as { target?: unknown }).target);
          if (typeof idx === "number" && Number.isInteger(idx) && known && target) {
            map.set(idx, { known, target });
          }
        }
        if (map.size === 0) {
          throw new OpenRouterChatError("Known-side repair returned no usable items.", true);
        }
        return map;
      },
    );

    const repaired = items.slice();
    let fixed = 0;
    for (const { index, item } of flagged) {
      const candidate = byIndex.get(index);
      if (!candidate) continue;
      const stillLooksLikeCategory = normalizedGeneratedText(candidate.known) === normalizedGeneratedText(item.category ?? "");
      if (
        stillLooksLikeCategory ||
        looksUntranslated(candidate.known, input.languageFrom) ||
        looksUntranslated(candidate.target, input.languageTo)
      ) {
        continue;
      }
      repaired[index] = { ...item, known: candidate.known, target: candidate.target };
      fixed += 1;
    }
    console.warn("[Get Word onboarding] known-side category leakage repair complete", {
      fixed,
      stillFlagged: flagged.length - fixed,
    });
    return repaired;
  } catch (err) {
    console.warn("[Get Word onboarding] known-side category leakage repair failed; keeping originals", {
      error: err instanceof Error ? err.message : err,
    });
    return items;
  }
}

// Re-translates rows whose target looks untranslated (wrong-script) using a
// different strong model, so the primary model's mistake is not simply repeated.
// Best-effort: any failure leaves the original rows untouched.
async function repairWrongScriptItems(
  items: GeneratedCommonItem[],
  languageFrom: string,
  languageTo: string,
): Promise<GeneratedCommonItem[]> {
  const flagged = items
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => looksUntranslated(item.target, languageTo));
  if (flagged.length === 0) return items;

  console.warn("[Get Word onboarding] repairing wrong-script translations", {
    flagged: flagged.length,
    total: items.length,
    languageFrom,
    languageTo,
    repairModel: SERVER_AUTOGENERATE_REPAIR_MODEL,
  });

  try {
    const prompt = buildRepairPrompt(
      languageFrom,
      languageTo,
      flagged.map(({ index, item }) => ({ index, source: item.known })),
    );
    const byIndex = await callOpenRouterChatParsed(
      serverChatOptions(prompt, SERVER_AUTOGENERATE_REPAIR_MODEL),
      (content) => {
        const map = new Map<number, string>();
        for (const row of extractItemsArray(parseJsonLoose(content))) {
          if (!row || typeof row !== "object") continue;
          const idx = (row as { index?: unknown }).index;
          const target = cleanText((row as { target?: unknown }).target);
          if (typeof idx === "number" && Number.isInteger(idx) && target) {
            map.set(idx, target);
          }
        }
        if (map.size === 0) {
          throw new OpenRouterChatError("Repair returned no usable items.", true);
        }
        return map;
      },
    );

    const repaired = items.slice();
    let fixed = 0;
    for (const { index, item } of flagged) {
      const candidate = byIndex.get(index);
      // Only accept the repair if it actually fixed the script problem.
      if (candidate && !looksUntranslated(candidate, languageTo)) {
        repaired[index] = { ...item, target: candidate };
        fixed += 1;
      }
    }
    console.warn("[Get Word onboarding] wrong-script repair complete", {
      fixed,
      stillFlagged: flagged.length - fixed,
    });
    return repaired;
  } catch (err) {
    console.warn("[Get Word onboarding] wrong-script repair failed; keeping originals", {
      error: err instanceof Error ? err.message : err,
    });
    return items;
  }
}

// Best-effort, non-fatal: run the deterministic quality validators across the
// generated batch and log a summary so curated-list quality problems (register
// loss, missing articles, uncapitalized sentences) are visible server-side.
// Per-row surfacing to the editor happens later via the translation step.
function logTranslationQualityWarnings(
  items: GeneratedCommonItem[],
  languageFrom: string,
  languageTo: string,
) {
  const counts: Record<string, number> = {};
  let flaggedRows = 0;
  for (const item of items) {
    const warnings = validateTranslation({
      source: item.known,
      target: item.target,
      fromLang: languageFrom,
      toLang: languageTo,
    });
    if (warnings.length > 0) flaggedRows += 1;
    for (const w of warnings) counts[w.code] = (counts[w.code] ?? 0) + 1;
  }
  if (flaggedRows > 0) {
    console.warn("[Get Word onboarding] translation quality warnings", {
      flaggedRows,
      total: items.length,
      byCode: counts,
      languageFrom,
      languageTo,
    });
  }
  return items;
}

export async function generateFromOpenRouterSeed(input: {
  languageFrom: string;
  languageTo: string;
  sourceLanguage: string;
  sourceList: WordList;
  sourceItems: SeedSourceItem[];
}) {
  const generated: GeneratedCommonItem[] = [];
  for (let i = 0; i < input.sourceItems.length; i += OPENROUTER_BATCH_SIZE) {
    const chunk = input.sourceItems.slice(i, i + OPENROUTER_BATCH_SIZE);
    const expected = new Set(chunk.map((item) => item.sourceIndex));
    const prompt = buildSeedPrompt({
      languageFrom: input.languageFrom,
      languageTo: input.languageTo,
      sourceLanguage: input.sourceLanguage,
      sourceList: input.sourceList,
      items: chunk,
    });
    const items = await callOpenRouterChatParsed(
      serverChatOptions(prompt),
      (content) => {
        const parsed = parseSeedItems(parseJsonLoose(content), expected);
        if (parsed.length === 0) {
          throw new OpenRouterChatError(
            "OpenRouter returned no usable seed items.",
            true,
          );
        }
        return parsed;
      },
    );

    // A mostly-correct response is still useful. Make one focused attempt to
    // recover only omitted rows, but never discard the good rows or fail the
    // whole list merely because that recovery call does not succeed.
    const returnedIndexes = new Set(items.map((item) => item.sourceIndex));
    const missing = chunk.filter((item) => !returnedIndexes.has(item.sourceIndex));
    if (missing.length > 0) {
      console.warn("[Get Word onboarding] retrying omitted seed items", {
        missing: missing.length,
        batchSize: chunk.length,
      });
      try {
        const missingExpected = new Set(missing.map((item) => item.sourceIndex));
        const recovered = await callOpenRouterChatParsed(
          serverChatOptions(buildSeedPrompt({ ...input, items: missing })),
          (content) => {
            const parsed = parseSeedItems(parseJsonLoose(content), missingExpected);
            if (parsed.length === 0) {
              throw new OpenRouterChatError(
                "OpenRouter returned no usable omitted seed items.",
                true,
              );
            }
            return parsed;
          },
        );
        items.push(...recovered);
      } catch (err) {
        console.warn("[Get Word onboarding] omitted seed item recovery failed; continuing", {
          missing: missing.length,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    // The model may reorder rows; source order is meaningful for the resulting
    // study list even when some rows could not be recovered.
    items.sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0));
    generated.push(...items);
  }
  const sliced = generated.slice(0, MAX_GENERATED_ITEMS);
  const repaired = await repairWrongScriptItems(
    sliced,
    input.languageFrom,
    input.languageTo,
  );
  const knownSideRepaired = await repairKnownSideLeaks(repaired, input);
  return logTranslationQualityWarnings(knownSideRepaired, input.languageFrom, input.languageTo);
}

export async function generateNewOpenRouterList(languageFrom: string, languageTo: string) {
  const prompt = buildNewListPrompt(languageFrom, languageTo, DEFAULT_LLM_ITEM_COUNT);
  const items = await callOpenRouterChatParsed(serverChatOptions(prompt), (content) => {
    const parsed = parseNewListItems(parseJsonLoose(content));
    if (parsed.length === 0) {
      throw new OpenRouterChatError("OpenRouter returned no usable items.", true);
    }
    return parsed;
  });
  const sliced = items.slice(0, DEFAULT_LLM_ITEM_COUNT);
  const repaired = await repairWrongScriptItems(sliced, languageFrom, languageTo);
  return logTranslationQualityWarnings(repaired, languageFrom, languageTo);
}
