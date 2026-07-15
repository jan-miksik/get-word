import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { generatePhotoLabAudio } from "@/features/photo-lab/server/audio";
import {
  MAX_AUDIO_TEXT_CHARS,
  MAX_AUDIO_TOTAL_CHARS,
  MAX_LABELS,
} from "@/features/photo-lab/server/config";

export const runtime = "nodejs";

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = (await request.json().catch(() => null)) as {
    items?: unknown;
    language?: unknown;
  } | null;

  if (typeof body?.language !== "string" || !body.language.trim()) {
    return badRequest("language is required");
  }
  const language = normalizeLanguageCode(body.language);

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return badRequest("items array is required and must not be empty");
  }
  if (body.items.length > MAX_LABELS) {
    return badRequest(`Maximum ${MAX_LABELS} items per request`);
  }

  const seenIds = new Set<string>();
  const items: { id: string; text: string }[] = [];
  let totalChars = 0;
  for (const raw of body.items) {
    const { id, text } = (raw ?? {}) as { id?: unknown; text?: unknown };
    if (typeof id !== "string" || !id.trim() || typeof text !== "string") {
      return badRequest("each item needs a string id and text");
    }
    if (seenIds.has(id)) {
      return badRequest("item ids must be unique");
    }
    seenIds.add(id);
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_AUDIO_TEXT_CHARS) {
      return badRequest(`item text must be 1-${MAX_AUDIO_TEXT_CHARS} characters`);
    }
    totalChars += trimmed.length;
    items.push({ id, text: trimmed });
  }
  if (totalChars > MAX_AUDIO_TOTAL_CHARS) {
    return badRequest(`total text length must not exceed ${MAX_AUDIO_TOTAL_CHARS} characters`);
  }

  const { results } = await generatePhotoLabAudio({ userId: user.id, language, items });
  return NextResponse.json({ results });
}
