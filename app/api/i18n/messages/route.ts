import { NextRequest, NextResponse } from "next/server";
import { getMessagesForLanguage } from "@/lib/i18n/server";
import { normalizeLanguageCode } from "@/lib/i18n/languages";

export async function GET(request: NextRequest) {
  const language = normalizeLanguageCode(request.nextUrl.searchParams.get("language") ?? "en");
  const payload = await getMessagesForLanguage(language);
  return NextResponse.json(payload);
}
