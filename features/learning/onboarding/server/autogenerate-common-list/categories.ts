import type { WordCategory } from "@/lib/db/schema";
import { cleanCategory, cleanText } from "./helpers";
import { callOpenRouterJson } from "./openrouter";

// Matches the fork route's bilingual "<known> - <target>" category title format.
const CATEGORY_TITLE_SEPARATOR = " - ";

type CategoryTranslation = { known: string; target: string };

export function swapBilingualTitle(name: string) {
  const idx = name.indexOf(CATEGORY_TITLE_SEPARATOR);
  if (idx === -1) return name;
  const fromSide = name.slice(0, idx);
  const toSide = name.slice(idx + CATEGORY_TITLE_SEPARATOR.length);
  return `${toSide}${CATEGORY_TITLE_SEPARATOR}${fromSide}`;
}

// Pull the single side to translate out of a (possibly already-bilingual)
// category title so "základ - basic" is not re-translated as a whole.
function extractCategorySourceText(
  name: string,
  seedLanguageTo: string,
  sourceLanguage: string,
): string {
  const idx = name.indexOf(CATEGORY_TITLE_SEPARATOR);
  if (idx === -1) return name;
  const fromSide = name.slice(0, idx);
  const toSide = name.slice(idx + CATEGORY_TITLE_SEPARATOR.length);
  return sourceLanguage === seedLanguageTo ? toSide : fromSide;
}

function buildCategoryTitlePrompt(input: {
  names: string[];
  sourceLanguage: string;
  languageFrom: string;
  languageTo: string;
}) {
  return `
Translate these word-list category labels from ${input.sourceLanguage} into ${input.languageFrom} and ${input.languageTo}.
These are short headings for a beginner language-learning app (e.g. "Greetings", "Food", "Numbers"). Use the common everyday term a native speaker would use for the category; keep them short. Echo the "source" value back exactly as given.

Return JSON with this exact shape:
{
  "items": [
    { "source": "<original label>", "known": "<label in ${input.languageFrom}>", "target": "<label in ${input.languageTo}>" }
  ]
}

Labels:
${JSON.stringify(input.names)}
`.trim();
}

// Translates the distinct seed category labels into both target languages with a
// single LLM call. Keyed by lower-cased source text so a model that re-cases the
// echoed "source" still matches.
async function translateCategoryTitles(input: {
  names: string[];
  sourceLanguage: string;
  languageFrom: string;
  languageTo: string;
}): Promise<Map<string, CategoryTranslation>> {
  const map = new Map<string, CategoryTranslation>();
  if (input.names.length === 0) return map;

  const parsed = await callOpenRouterJson(buildCategoryTitlePrompt(input));
  const items = Array.isArray((parsed as { items?: unknown }).items)
    ? (parsed as { items: unknown[] }).items
    : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const source = cleanText((item as { source?: unknown }).source);
    const known = cleanText((item as { known?: unknown }).known);
    const target = cleanText((item as { target?: unknown }).target);
    if (!source || !known || !target) continue;
    map.set(source.toLowerCase(), { known, target });
  }
  return map;
}

// Translates seed category names into the same bilingual "<known> - <target>"
// titles a fork produces, keyed by the cleaned origin name. Falls back to the
// origin names if translation is disabled or the LLM call fails.
export async function buildSeedCategoryMapping(input: {
  categories: WordCategory[];
  seedLanguageTo: string;
  sourceLanguage: string;
  languageFrom: string;
  languageTo: string;
  translate: boolean;
}): Promise<{ nameMap: Map<string, string>; orderedNames: string[] }> {
  const originNames = input.categories
    .map((category) => cleanCategory(category.name))
    .filter((name) => Boolean(name));
  const identity = () => {
    const nameMap = new Map(originNames.map((name) => [name, name]));
    return { nameMap, orderedNames: [...nameMap.values()] };
  };
  if (!input.translate || originNames.length === 0) return identity();

  const baseByName = new Map(
    originNames.map((name) => [
      name,
      extractCategorySourceText(
        name,
        input.seedLanguageTo,
        input.sourceLanguage,
      ),
    ]),
  );
  const baseTexts = Array.from(new Set([...baseByName.values()].filter(Boolean)));

  let translations: Map<string, CategoryTranslation>;
  try {
    translations = await translateCategoryTitles({
      names: baseTexts,
      sourceLanguage: input.sourceLanguage,
      languageFrom: input.languageFrom,
      languageTo: input.languageTo,
    });
  } catch (err) {
    console.warn("[Get Word onboarding] category name translation failed; keeping origin names", {
      error: err instanceof Error ? err.message : err,
    });
    return identity();
  }

  const nameMap = new Map<string, string>();
  for (const name of originNames) {
    const base = baseByName.get(name) ?? name;
    const translated = translations.get(base.toLowerCase());
    const known = translated?.known ?? base;
    const target = translated?.target ?? base;
    nameMap.set(name, known === target ? known : `${known}${CATEGORY_TITLE_SEPARATOR}${target}`);
  }
  return { nameMap, orderedNames: originNames.map((name) => nameMap.get(name) ?? name) };
}
