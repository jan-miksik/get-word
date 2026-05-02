import { NextRequest, NextResponse } from "next/server";
import { COMMON_LANGUAGES, mergeLanguages, normalizeLanguageCode } from "@/lib/i18n/languages";
import { fetchGoogleSupportedLanguages } from "@/lib/i18n/server";

export async function GET(request: NextRequest) {
  const target = normalizeLanguageCode(request.nextUrl.searchParams.get("target") ?? "en");
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

  const googleLanguages = await fetchGoogleSupportedLanguages(target).catch(() => COMMON_LANGUAGES);
  const languages = mergeLanguages(COMMON_LANGUAGES, googleLanguages).filter((language) => {
    if (!query) return true;
    return (
      language.code.toLowerCase().includes(query) ||
      language.name.toLowerCase().includes(query)
    );
  });

  return NextResponse.json({ languages });
}

