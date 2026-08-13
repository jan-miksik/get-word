import { googleTranslate } from "@/lib/translation";
import type { GeneratedCommonItem } from "./types";

export type GoogleSeedSourceItem = {
  sourceIndex: number;
  source: string;
  category: string;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function cleanCategory(value: unknown) {
  const cleaned = cleanText(value);
  return cleaned || "Common";
}

async function translateSide(input: {
  texts: string[];
  sourceLanguage: string;
  targetLanguage: string;
  userId: string;
}) {
  if (input.sourceLanguage === input.targetLanguage) {
    return input.texts.map((text) => cleanText(text));
  }

  const results = await googleTranslate(
    input.texts,
    input.sourceLanguage,
    input.targetLanguage,
    { source: "common_list_autogenerate", userId: input.userId },
  );
  return results.map((result) =>
    result.status === "ok" ? cleanText(result.translated) : "",
  );
}

export async function generateFromGoogleTranslateSeed(input: {
  userId: string;
  languageFrom: string;
  languageTo: string;
  sourceLanguage: string;
  sourceItems: GoogleSeedSourceItem[];
}): Promise<GeneratedCommonItem[]> {
  const sourceTexts = input.sourceItems.map((item) => cleanText(item.source));
  const [knownTexts, targetTexts] = await Promise.all([
    translateSide({
      texts: sourceTexts,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.languageFrom,
      userId: input.userId,
    }),
    translateSide({
      texts: sourceTexts,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.languageTo,
      userId: input.userId,
    }),
  ]);

  const generated: GeneratedCommonItem[] = [];
  input.sourceItems.forEach((item, index) => {
    const known = cleanText(knownTexts[index]);
    const target = cleanText(targetTexts[index]);
    if (!known || !target) return;
    generated.push({
      sourceIndex: item.sourceIndex,
      known,
      target,
      category: cleanCategory(item.category),
    });
  });
  return generated;
}
