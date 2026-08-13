import { NextRequest, NextResponse } from "next/server";
import {
  COMMON_LANGUAGES,
  GOOGLE_TRANSLATE_LANGUAGES,
  getLocalizedLanguageName,
  languageMatchesSearch,
  mergeLanguages,
  normalizeLanguageCode,
} from "@/lib/i18n/languages";
import { BUNDLED_UI_LANGUAGE_CODES } from "@/lib/i18n/messages";

export async function GET(request: NextRequest) {
  const target = normalizeLanguageCode(request.nextUrl.searchParams.get("target") ?? "en");
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

  const bundledCodes = new Set(BUNDLED_UI_LANGUAGE_CODES.map(normalizeLanguageCode));
  const languages = mergeLanguages(COMMON_LANGUAGES, GOOGLE_TRANSLATE_LANGUAGES).filter((language) => {
    if (!bundledCodes.has(normalizeLanguageCode(language.code))) return false;
    if (!query) return true;
    return languageMatchesSearch(language, query, [
      getLocalizedLanguageName(language.code, target) ?? "",
    ]);
  });

  return NextResponse.json({ languages });
}
