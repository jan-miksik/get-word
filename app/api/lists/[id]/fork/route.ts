import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import {
  createCategory,
  createList,
  findExistingTranslations,
  findMediaByHashes,
  getListById,
  getListCategories,
  getListItems,
} from "@/lib/db";
import { wordListItems } from "@/lib/db/schema";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { computeContentHash } from "@/lib/audio";
import { googleTranslate } from "@/lib/translation";
import { normalizeLanguageCode } from "@/lib/i18n/languages";

type RouteContext = { params: Promise<{ id: string }> };

const AUDIO_PROVIDER = "google_tts";
const AUDIO_FORMAT = "mp3";
const AUDIO_VOICE = "default";

function getItemTextForLanguage(
  item: Awaited<ReturnType<typeof getListItems>>[number],
  sourceFrom: string,
  sourceTo: string,
  language: string,
): { text: string | null; language: string } {
  if (sourceFrom === language) return { text: item.textKnown, language: sourceFrom };
  if (sourceTo === language) return { text: item.textTarget, language: sourceTo };
  if (item.textKnown) return { text: item.textKnown, language: sourceFrom };
  return { text: item.textTarget, language: sourceTo };
}

async function translateWithReuse(
  text: string,
  fromLanguage: string,
  toLanguage: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  if (fromLanguage === toLanguage) return text;
  const key = `${fromLanguage}\u0000${toLanguage}\u0000${text}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const reused = await findExistingTranslations([text], "textKnown", fromLanguage, toLanguage);
  const reusedText = reused[0]?.translatedText ?? null;
  if (reusedText) {
    cache.set(key, reusedText);
    return reusedText;
  }

  const [translated] = await googleTranslate([text], fromLanguage, toLanguage);
  const translatedText =
    translated?.status === "ok" && translated.translated
      ? translated.translated
      : null;
  cache.set(key, translatedText);
  return translatedText;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id: sourceListId } = await context.params;
  const sourceList = await getListById(sourceListId);
  if (!sourceList) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (!sourceList.isPublic && sourceList.ownerId !== user.id) {
    return NextResponse.json({ error: "Cannot fork this list" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const rawLanguageFrom = body.language_from;
  const rawLanguageTo = body.language_to;
  if (typeof rawLanguageFrom !== "string" || typeof rawLanguageTo !== "string") {
    return NextResponse.json(
      { error: "language_from and language_to are required" },
      { status: 400 },
    );
  }

  const languageFrom = normalizeLanguageCode(rawLanguageFrom);
  const languageTo = normalizeLanguageCode(rawLanguageTo);
  if (languageFrom === languageTo) {
    return NextResponse.json(
      { error: "language_from and language_to must be different" },
      { status: 400 },
    );
  }

  const [sourceCategories, sourceItems] = await Promise.all([
    getListCategories(sourceListId),
    getListItems(sourceListId),
  ]);

  const forkedList = await createList({
    ownerId: user.id,
    name: typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : `${sourceList.name} (${languageFrom} -> ${languageTo})`,
    description: sourceList.description,
    languageFrom,
    languageTo,
    isPublic: false,
  });

  const categoryMap = new Map<string, string>();
  for (const category of sourceCategories) {
    const created = await createCategory(forkedList.id, category.name, category.isSystem);
    categoryMap.set(category.id, created.id);
  }

  const translationCache = new Map<string, string | null>();
  const preparedItems = [];
  const hashes: string[] = [];

  for (const [index, item] of sourceItems.entries()) {
    const knownSeed = getItemTextForLanguage(
      item,
      sourceList.languageFrom,
      sourceList.languageTo,
      languageFrom,
    );
    const targetSeed = getItemTextForLanguage(
      item,
      sourceList.languageFrom,
      sourceList.languageTo,
      languageTo,
    );

    const textKnown = knownSeed.text
      ? await translateWithReuse(knownSeed.text, knownSeed.language, languageFrom, translationCache)
      : null;
    const textTarget = targetSeed.text
      ? await translateWithReuse(targetSeed.text, targetSeed.language, languageTo, translationCache)
      : null;

    const knownHash = textKnown
      ? computeContentHash(textKnown, languageFrom, AUDIO_PROVIDER, {
          voiceId: AUDIO_VOICE,
          audioFormat: AUDIO_FORMAT,
        })
      : null;
    const targetHash = textTarget
      ? computeContentHash(textTarget, languageTo, AUDIO_PROVIDER, {
          voiceId: AUDIO_VOICE,
          audioFormat: AUDIO_FORMAT,
        })
      : null;
    if (knownHash) hashes.push(knownHash);
    if (targetHash) hashes.push(targetHash);

    preparedItems.push({
      sourceItem: item,
      listId: forkedList.id,
      categoryId: item.categoryId ? categoryMap.get(item.categoryId) ?? null : null,
      canonicalWordId: item.id,
      position: index,
      textKnown: textKnown ?? knownSeed.text ?? "",
      textTarget,
      translationStatus: textKnown && textTarget ? "translated" as const : "failed" as const,
      knownHash,
      targetHash,
    });
  }

  const mediaByHash = await findMediaByHashes(Array.from(new Set(hashes)));
  const createdItems = preparedItems.length > 0
    ? await db
        .insert(wordListItems)
        .values(
          preparedItems.map((item) => ({
            listId: item.listId,
            categoryId: item.categoryId,
            canonicalWordId: item.canonicalWordId,
            position: item.position,
            textKnown: item.textKnown,
            textTarget: item.textTarget,
            translationStatus: item.translationStatus,
            knownAudioAssetId: item.knownHash ? mediaByHash.get(item.knownHash)?.id ?? null : null,
            knownAudioStatus: item.knownHash && mediaByHash.has(item.knownHash) ? "ready" as const : "none" as const,
            audioAssetId: item.targetHash ? mediaByHash.get(item.targetHash)?.id ?? null : null,
            audioStatus: item.targetHash && mediaByHash.has(item.targetHash) ? "ready" as const : "none" as const,
            notes: item.sourceItem.notes,
          })),
        )
        .returning()
    : [];

  return NextResponse.json({
    list: forkedList,
    copied: createdItems.length,
    reused_audio: createdItems.filter((item) => item.knownAudioAssetId || item.audioAssetId).length,
  }, { status: 201 });
}
