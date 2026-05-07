import { NextRequest, NextResponse } from "next/server";
import { getLearningLanguageCatalog } from "@/lib/language-catalog";
import { normalizeLanguageCode } from "@/lib/i18n/languages";

export async function GET(request: NextRequest) {
  const target = normalizeLanguageCode(request.nextUrl.searchParams.get("target") ?? "en");
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const languages = (await getLearningLanguageCatalog(target)).filter((language) => {
    if (!query) return true;
    return (
      language.code.toLowerCase().includes(query) ||
      language.name.toLowerCase().includes(query)
    );
  });

  return NextResponse.json({ languages });
}
