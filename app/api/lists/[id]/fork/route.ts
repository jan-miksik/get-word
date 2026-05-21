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
import {
  getUserApiKey,
  googleTranslate,
  openRouterTranslate,
} from "@/lib/translation";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { normalizeOpenRouterModel } from "@/lib/openrouter-models";

type RouteContext = { params: Promise<{ id: string }> };

const AUDIO_PROVIDER = "google_tts";
const AUDIO_FORMAT = "mp3";
const AUDIO_VOICE = "default";
type TranslationProvider = "google" | "openrouter" | "none";
type ListSide = "known" | "target";
type SourceItem = Awaited<ReturnType<typeof getListItems>>[number];

function getSourceSideForLanguage(
  sourceFrom: string,
  sourceTo: string,
  language: string,
): ListSide | null {
  if (sourceFrom === language) return "known";
  if (sourceTo === language) return "target";
  return null;
}

function getItemTextForSide(item: SourceItem, side: ListSide): string | null {
  return side === "known" ? item.textKnown : item.textTarget;
}

function getItemAudioForSide(item: SourceItem, side: ListSide) {
  return side === "known"
    ? {
        audioAssetId: item.knownAudioAssetId,
        audioStatus: item.knownAudioStatus,
      }
    : {
        audioAssetId: item.audioAssetId,
        audioStatus: item.audioStatus,
      };
}

async function translateWithReuse(
  text: string,
  fromLanguage: string,
  toLanguage: string,
  provider: Exclude<TranslationProvider, "none">,
  openRouterKey: string | null,
  translationModel: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  if (fromLanguage === toLanguage) return text;
  const key = `${provider}\u0000${fromLanguage}\u0000${toLanguage}\u0000${text}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const reused = await findExistingTranslations([text], "textKnown", fromLanguage, toLanguage);
  const reusedText = reused[0]?.translatedText ?? null;
  if (reusedText) {
    cache.set(key, reusedText);
    return reusedText;
  }

  const [translated] =
    provider === "google"
      ? await googleTranslate([text], fromLanguage, toLanguage)
      : openRouterKey
        ? await openRouterTranslate([text], fromLanguage, toLanguage, openRouterKey, translationModel)
        : [{ text, translated: null, status: "error" as const }];
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
  const sourceLanguageFrom = normalizeLanguageCode(sourceList.languageFrom);
  const sourceLanguageTo = normalizeLanguageCode(sourceList.languageTo);
  const translationProvider = (
    body.translation_provider === "google" ||
    body.translation_provider === "openrouter" ||
    body.translation_provider === "none"
      ? body.translation_provider
      : "none"
  ) as TranslationProvider;
  const translationModel = normalizeOpenRouterModel(body.translation_model);
  const sourceLanguage = normalizeLanguageCode(
    typeof body.source_language === "string" && body.source_language.trim()
      ? body.source_language
      : sourceLanguageFrom,
  );
  if (sourceLanguage !== sourceLanguageFrom && sourceLanguage !== sourceLanguageTo) {
    return NextResponse.json(
      { error: "source_language must be one of the source list languages" },
      { status: 400 },
    );
  }
  let openRouterKey: string | null = null;
  if (translationProvider === "openrouter") {
    openRouterKey = await getUserApiKey(user.id, "openrouter");
    if (!openRouterKey) {
      return NextResponse.json(
        { error: "OpenRouter requires a stored API key. Add your key in settings." },
        { status: 400 },
      );
    }
  }

  const forkedList = await createList({
    ownerId: user.id,
    name: typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : `${sourceList.name} (${languageFrom} / ${languageTo})`,
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
  let translatedCount = 0;
  let clearedKnownCount = 0;
  let clearedTargetCount = 0;

  for (const [index, item] of sourceItems.entries()) {
    const knownSourceSide = getSourceSideForLanguage(sourceLanguageFrom, sourceLanguageTo, languageFrom);
    const targetSourceSide = getSourceSideForLanguage(sourceLanguageFrom, sourceLanguageTo, languageTo);
    const requestedSourceSide = sourceLanguage === sourceLanguageFrom ? "known" : "target";
    const requestedSourceText = getItemTextForSide(item, requestedSourceSide);

    let textKnown: string | null = knownSourceSide ? getItemTextForSide(item, knownSourceSide) : null;
    let textTarget: string | null = targetSourceSide ? getItemTextForSide(item, targetSourceSide) : null;
    let knownAudioAssetId: string | null = null;
    let knownAudioStatus: "none" | "pending" | "ready" | "failed" = "none";
    let audioAssetId: string | null = null;
    let audioStatus: "none" | "pending" | "ready" | "failed" = "none";

    if (knownSourceSide && textKnown) {
      const copied = getItemAudioForSide(item, knownSourceSide);
      knownAudioAssetId = copied.audioAssetId ?? null;
      knownAudioStatus = copied.audioAssetId ? copied.audioStatus : "none";
    } else if (translationProvider !== "none" && requestedSourceText) {
      textKnown = await translateWithReuse(
        requestedSourceText,
        sourceLanguage,
        languageFrom,
        translationProvider,
        openRouterKey,
        translationModel,
        translationCache,
      );
      if (textKnown) translatedCount += 1;
    }

    if (targetSourceSide && textTarget) {
      const copied = getItemAudioForSide(item, targetSourceSide);
      audioAssetId = copied.audioAssetId ?? null;
      audioStatus = copied.audioAssetId ? copied.audioStatus : "none";
    } else if (translationProvider !== "none" && requestedSourceText) {
      textTarget = await translateWithReuse(
        requestedSourceText,
        sourceLanguage,
        languageTo,
        translationProvider,
        openRouterKey,
        translationModel,
        translationCache,
      );
      if (textTarget) translatedCount += 1;
    }

    if (!knownSourceSide && !textKnown) clearedKnownCount += 1;
    if (!targetSourceSide && !textTarget) clearedTargetCount += 1;

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
      textKnown: textKnown ?? "",
      textTarget,
      translationStatus: textKnown && textTarget ? "translated" as const : "pending" as const,
      knownHash,
      targetHash,
      knownAudioAssetId,
      knownAudioStatus,
      audioAssetId,
      audioStatus,
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
            knownAudioAssetId:
              item.knownAudioAssetId ??
              (item.knownHash ? mediaByHash.get(item.knownHash)?.id ?? null : null),
            knownAudioStatus:
              item.knownAudioAssetId
                ? item.knownAudioStatus
                : item.knownHash && mediaByHash.has(item.knownHash)
                  ? "ready" as const
                  : "none" as const,
            audioAssetId:
              item.audioAssetId ??
              (item.targetHash ? mediaByHash.get(item.targetHash)?.id ?? null : null),
            audioStatus:
              item.audioAssetId
                ? item.audioStatus
                : item.targetHash && mediaByHash.has(item.targetHash)
                  ? "ready" as const
                  : "none" as const,
            notes: item.sourceItem.notes,
          })),
        )
        .returning()
    : [];

  return NextResponse.json({
    list: forkedList,
    copied: createdItems.length,
    translated: translatedCount,
    cleared_sides: [
      clearedKnownCount > 0 ? "known" : null,
      clearedTargetCount > 0 ? "target" : null,
    ].filter(Boolean),
    missing_audio: {
      known: createdItems.filter((item) => item.textKnown && !item.knownAudioAssetId).length,
      target: createdItems.filter((item) => item.textTarget && !item.audioAssetId).length,
    },
    reused_audio: createdItems.filter((item) => item.knownAudioAssetId || item.audioAssetId).length,
  }, { status: 201 });
}
