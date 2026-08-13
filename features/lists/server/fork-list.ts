import { db } from "@/lib/db/client";
import { serializeWordList } from "@/lib/word-list-dto";
import {
  createCategory,
  createList,
  deleteList,
  findMediaByHashes,
  getMediaAssetsByIds,
  getListCategories,
  getListItems,
} from "@/lib/db";
import { wordListItems } from "@/lib/db/schema";
import { computeContentHash } from "@/lib/audio";
import { isPlayableAudioAsset } from "@/lib/audio-assets";
import {
  getUserApiKey,
  googleTranslate,
  openRouterTranslate,
} from "@/lib/translation";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { normalizeOpenRouterModel } from "@/lib/openrouter-models";
import {
  normalizeWordItemComment,
  type WordItemComment,
} from "@/lib/word-item-comment";

type ForkSourceList = {
  id: string;
  ownerId: string | null;
  name: string;
  description: string | null;
  languageFrom: string;
  languageTo: string;
  isPublic: boolean;
};

export class ForkListInputError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ForkListInputError";
  }
}

interface CreateForkListStreamInput {
  userId: string;
  sourceList: ForkSourceList;
  body: Record<string, unknown>;
}

/**
 * Decide which (if any) comment carries to a fork. Comments — manual and
 * generated alike — are pair- and perspective-specific: a note written for
 * one direction reads in the wrong language/perspective once the pair changes
 * (a reversal swaps which side is "known"). So a comment carries only when the
 * fork keeps BOTH languages unchanged (a same-pair customization fork);
 * otherwise it's dropped. Fork never auto-regenerates.
 */
function forkComment(
  source: WordItemComment | null,
  languagesUnchanged: boolean,
): WordItemComment | null {
  if (!source) return null;
  return languagesUnchanged ? source : null;
}

const AUDIO_PROVIDER = "google_tts";
const AUDIO_FORMAT = "mp3";
const AUDIO_VOICE = "default";
type TranslationProvider = "google" | "openrouter" | "none";
type ListSide = "known" | "target";
type SourceItem = Awaited<ReturnType<typeof getListItems>>[number];

// Provider batch sizes mirror the limits used inside the translation helpers.
const PROVIDER_BATCH_SIZE: Record<Exclude<TranslationProvider, "none">, number> = {
  google: 128,
  openrouter: 50,
};

// Category titles default to a bilingual "<sourceFrom> - <sourceTo>" format.
const TITLE_SEPARATOR = " - ";

function translationKey(from: string, to: string, text: string): string {
  return JSON.stringify([from, to, text]);
}

// Extract the single side to translate from a (possibly already-bilingual)
// category title, so a "základ - basic" title is not re-translated as a whole.
function extractCategorySourceText(
  name: string,
  sourceLanguageTo: string,
  sourceLanguage: string,
): string {
  const idx = name.indexOf(TITLE_SEPARATOR);
  if (idx === -1) return name;
  const fromSide = name.slice(0, idx);
  const toSide = name.slice(idx + TITLE_SEPARATOR.length);
  return sourceLanguage === sourceLanguageTo ? toSide : fromSide;
}

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

function getItemAcceptedAnswersForSide(item: SourceItem, side: ListSide): string[] {
  return side === "known" ? item.acceptedKnown ?? [] : item.acceptedTarget ?? [];
}

function getItemAudioForSide(
  item: SourceItem,
  side: ListSide,
  mediaAssets: Awaited<ReturnType<typeof getMediaAssetsByIds>>,
) {
  const audio = side === "known"
    ? {
        audioAssetId: item.knownAudioAssetId,
        audioStatus: item.knownAudioStatus,
      }
    : {
        audioAssetId: item.audioAssetId,
        audioStatus: item.audioStatus,
      };
  return isPlayableAudioAsset(mediaAssets.get(audio.audioAssetId ?? ""))
    ? audio
    : {
        audioAssetId: null,
        audioStatus: "none" as const,
      };
}

export async function createForkListStream({
  userId,
  sourceList,
  body,
}: CreateForkListStreamInput): Promise<ReadableStream<Uint8Array>> {
  const sourceListId = sourceList.id;
  const rawLanguageFrom = body.language_from;
  const rawLanguageTo = body.language_to;
  if (typeof rawLanguageFrom !== "string" || typeof rawLanguageTo !== "string") {
    throw new ForkListInputError("language_from and language_to are required", 400);
  }

  const languageFrom = normalizeLanguageCode(rawLanguageFrom);
  const languageTo = normalizeLanguageCode(rawLanguageTo);
  if (languageFrom === languageTo) {
    throw new ForkListInputError("language_from and language_to must be different", 400);
  }

  const [sourceCategories, sourceItems] = await Promise.all([
    getListCategories(sourceListId),
    getListItems(sourceListId),
  ]);
  const sourceAudioAssets = await getMediaAssetsByIds(
    sourceItems
      .flatMap((item) => [item.knownAudioAssetId, item.audioAssetId])
      .filter((id): id is string => Boolean(id)),
  );
  const sourceLanguageFrom = normalizeLanguageCode(sourceList.languageFrom);
  const sourceLanguageTo = normalizeLanguageCode(sourceList.languageTo);
  // Generated comments are pair-specific, so they carry only when the fork keeps
  // both languages identical to the source.
  const languagesUnchanged =
    sourceLanguageFrom === languageFrom && sourceLanguageTo === languageTo;
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
    throw new ForkListInputError("source_language must be one of the source list languages", 400);
  }
  let openRouterKey: string | null = null;
  if (translationProvider === "openrouter") {
    openRouterKey = await getUserApiKey(userId, "openrouter");
    if (!openRouterKey) {
      throw new ForkListInputError(
        "OpenRouter requires a stored API key. Add your key in settings.",
        400,
      );
    }
  }

  const forkedListName = typeof body.name === "string" && body.name.trim()
    ? body.name.trim()
    : `${sourceList.name} (${languageFrom} / ${languageTo})`;

  // Whether to regenerate bilingual category titles during translation (default on).
  const translateCategoryNames =
    translationProvider !== "none" && body.translate_category_names !== false;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let createdListId: string | null = null;
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        // ---- 1. Collect unique translation needs across items + categories ----
        // Each request is keyed by (from, to, text). Resolution fills `resolved`.
        const resolved = new Map<string, string>();
        const needsByPair = new Map<string, { from: string; to: string; texts: Set<string> }>();

        const requestTranslation = (from: string, to: string, text: string) => {
          if (!text) return;
          const key = translationKey(from, to, text);
          if (from === to) {
            // No API call needed; the translation is the text itself.
            if (!resolved.has(key)) resolved.set(key, text);
            return;
          }
          if (resolved.has(key)) return;
          const pairKey = `${from}->${to}`;
          let pair = needsByPair.get(pairKey);
          if (!pair) {
            pair = { from, to, texts: new Set() };
            needsByPair.set(pairKey, pair);
          }
          pair.texts.add(text);
        };

        const knownSourceSide = getSourceSideForLanguage(sourceLanguageFrom, sourceLanguageTo, languageFrom);
        const targetSourceSide = getSourceSideForLanguage(sourceLanguageFrom, sourceLanguageTo, languageTo);
        const requestedSourceSide = sourceLanguage === sourceLanguageFrom ? "known" : "target";

        for (const item of sourceItems) {
          // Invariant: always translate from the original source-side text, never
          // from a generated target, so register/meaning is never inherited
          // through a chain (target -> target).
          const requestedSourceText = getItemTextForSide(item, requestedSourceSide);
          if (translationProvider === "none" || !requestedSourceText) continue;
          // Known side needs translation only when the source has no matching language.
          if (!knownSourceSide) requestTranslation(sourceLanguage, languageFrom, requestedSourceText);
          if (!targetSourceSide) requestTranslation(sourceLanguage, languageTo, requestedSourceText);
        }

        if (translateCategoryNames) {
          for (const category of sourceCategories) {
            if (!category.name) continue;
            const base = extractCategorySourceText(
              category.name,
              sourceLanguageTo,
              sourceLanguage,
            );
            requestTranslation(sourceLanguage, languageFrom, base);
            requestTranslation(sourceLanguage, languageTo, base);
          }
        }

        const total =
          [...needsByPair.values()].reduce((sum, pair) => sum + pair.texts.size, 0) +
          // Local (from === to) resolutions already placed in `resolved`.
          resolved.size;
        let processed = resolved.size;

        // Emit initial progress so the bar reflects locally-resolved work.
        if (total > 0) {
          send({ type: "progress", phase: "translating", processed, total });
        }

        // ---- 2. Resolve translations in bulk, per (from, to) pair ----
        if (translationProvider !== "none") {
          const chunkSize = PROVIDER_BATCH_SIZE[translationProvider];
          for (const pair of needsByPair.values()) {
            const texts = [...pair.texts];
            for (let i = 0; i < texts.length; i += chunkSize) {
              const chunk = texts.slice(i, i + chunkSize);
              const results =
                translationProvider === "google"
                  ? await googleTranslate(chunk, pair.from, pair.to, {
                      source: "list_fork",
                      userId,
                    })
                  : await openRouterTranslate(
                      chunk,
                      pair.from,
                      pair.to,
                      openRouterKey as string,
                      translationModel,
                    );
              if (!Array.isArray(results) || results.length !== chunk.length) {
                throw new Error("Translation provider returned invalid result count");
              }
              for (let j = 0; j < chunk.length; j += 1) {
                const result = results[j];
                if (result?.status === "ok" && result.translated) {
                  resolved.set(translationKey(pair.from, pair.to, chunk[j]), result.translated);
                }
              }
              processed += chunk.length;
              send({ type: "progress", phase: "translating", processed, total });
            }
          }
        }

        const lookup = (from: string, to: string, text: string | null): string | null =>
          text ? resolved.get(translationKey(from, to, text)) ?? null : null;

        // ---- 3. Create the forked list (only after translations resolve) ----
        const forkedList = await createList({
          ownerId: userId,
          name: forkedListName,
          description: sourceList.description,
          languageFrom,
          languageTo,
          isPublic: false,
        });
        createdListId = forkedList.id;

        // ---- 4. Create categories with bilingual titles ----
        const categoryMap = new Map<string, string>();
        for (const category of sourceCategories) {
          let name = category.name;
          if (translateCategoryNames) {
            const base = extractCategorySourceText(
              category.name,
              sourceLanguageTo,
              sourceLanguage,
            );
            const known = lookup(sourceLanguage, languageFrom, base);
            const target = lookup(sourceLanguage, languageTo, base);
            if (known || target) {
              name = (known ?? base) === (target ?? base)
                ? known ?? target ?? base
                : `${known ?? base}${TITLE_SEPARATOR}${target ?? base}`;
            }
            // Both sides unresolved: keep the original title as a fallback.
          }
          const created = await createCategory(forkedList.id, name, category.isSystem);
          categoryMap.set(category.id, created.id);
        }

        // ---- 5. Build prepared items from resolved translations ----
        const preparedItems = [];
        const hashes: string[] = [];
        let translatedCount = 0;
        let clearedKnownCount = 0;
        let clearedTargetCount = 0;
        // Items that needed at least one translation call (per-word unit), so the
        // reuse-vs-generation log counts a word once even if both sides were new.
        const translatedItemIndexes = new Set<number>();

        for (const [index, item] of sourceItems.entries()) {
          const requestedSourceText = getItemTextForSide(item, requestedSourceSide);

          let textKnown: string | null = knownSourceSide ? getItemTextForSide(item, knownSourceSide) : null;
          let textTarget: string | null = targetSourceSide ? getItemTextForSide(item, targetSourceSide) : null;
          let knownAudioAssetId: string | null = null;
          let knownAudioStatus: "none" | "pending" | "ready" | "failed" = "none";
          let audioAssetId: string | null = null;
          let audioStatus: "none" | "pending" | "ready" | "failed" = "none";
          let acceptedKnown: string[] = [];
          let acceptedTarget: string[] = [];

          if (knownSourceSide && textKnown) {
            const copied = getItemAudioForSide(item, knownSourceSide, sourceAudioAssets);
            knownAudioAssetId = copied.audioAssetId ?? null;
            knownAudioStatus = copied.audioAssetId ? copied.audioStatus : "none";
            acceptedKnown = getItemAcceptedAnswersForSide(item, knownSourceSide);
          } else if (translationProvider !== "none" && requestedSourceText) {
            textKnown = lookup(sourceLanguage, languageFrom, requestedSourceText);
            if (textKnown) {
              translatedCount += 1;
              translatedItemIndexes.add(index);
            }
          }

          if (targetSourceSide && textTarget) {
            const copied = getItemAudioForSide(item, targetSourceSide, sourceAudioAssets);
            audioAssetId = copied.audioAssetId ?? null;
            audioStatus = copied.audioAssetId ? copied.audioStatus : "none";
            acceptedTarget = getItemAcceptedAnswersForSide(item, targetSourceSide);
          } else if (translationProvider !== "none" && requestedSourceText) {
            textTarget = lookup(sourceLanguage, languageTo, requestedSourceText);
            if (textTarget) {
              translatedCount += 1;
              translatedItemIndexes.add(index);
            }
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
            acceptedKnown,
            acceptedTarget,
            translationStatus: textKnown && textTarget ? "translated" as const : "pending" as const,
            knownHash,
            targetHash,
            knownAudioAssetId,
            knownAudioStatus,
            audioAssetId,
            audioStatus,
          });
        }

        // ---- 6. Insert items ----
        send({
          type: "progress",
          phase: "saving",
          processed: total > 0 ? total : 1,
          total: total > 0 ? total : 1,
        });

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
                  acceptedKnown: item.acceptedKnown,
                  acceptedTarget: item.acceptedTarget,
                  translationStatus: item.translationStatus,
                  knownAudioAssetId:
                    item.knownAudioAssetId ??
                    (item.knownHash && isPlayableAudioAsset(mediaByHash.get(item.knownHash))
                      ? mediaByHash.get(item.knownHash)?.id ?? null
                      : null),
                  knownAudioStatus:
                    item.knownAudioAssetId
                      ? item.knownAudioStatus
                      : item.knownHash && isPlayableAudioAsset(mediaByHash.get(item.knownHash))
                        ? "ready" as const
                        : "none" as const,
                  audioAssetId:
                    item.audioAssetId ??
                    (item.targetHash && isPlayableAudioAsset(mediaByHash.get(item.targetHash))
                      ? mediaByHash.get(item.targetHash)?.id ?? null
                      : null),
                  audioStatus:
                    item.audioAssetId
                      ? item.audioStatus
                      : item.targetHash && isPlayableAudioAsset(mediaByHash.get(item.targetHash))
                        ? "ready" as const
                        : "none" as const,
                  notes: item.sourceItem.notes,
                  comment: forkComment(
                    normalizeWordItemComment(item.sourceItem.comment),
                    languagesUnchanged,
                  ),
                })),
              )
              .returning()
          : [];

        const missingAudioKnown = createdItems.filter(
          (item) => item.textKnown && !item.knownAudioAssetId,
        ).length;
        const missingAudioTarget = createdItems.filter(
          (item) => item.textTarget && !item.audioAssetId,
        ).length;
        const reusedAudioClips =
          createdItems.filter((item) => item.knownAudioAssetId).length +
          createdItems.filter((item) => item.audioAssetId).length;
        const generatedTranslationItems = translatedItemIndexes.size;
        send({
          type: "done",
          result: {
            list: serializeWordList(forkedList),
            copied: createdItems.length,
            translated: translatedCount,
            cleared_sides: [
              clearedKnownCount > 0 ? "known" : null,
              clearedTargetCount > 0 ? "target" : null,
            ].filter(Boolean),
            missing_audio: {
              known: missingAudioKnown,
              target: missingAudioTarget,
            },
            reused_audio: createdItems.filter((item) => item.knownAudioAssetId || item.audioAssetId).length,
            // Reuse-vs-generation counts: translations per word/item, audio per
            // clip. Fork does no TTS, so audio is either reused or still missing.
            stats: {
              translations: {
                reused: createdItems.length - generatedTranslationItems,
                generated: generatedTranslationItems,
              },
              audio: {
                reused: reusedAudioClips,
                generated: 0,
                missing: missingAudioKnown + missingAudioTarget,
              },
            },
          },
        });
      } catch (error) {
        console.error("Fork failed", error);
        if (createdListId) {
          try {
            await deleteList(createdListId);
          } catch (cleanupError) {
            console.error("Failed to clean up partial fork", cleanupError);
          }
        }
        send({ type: "error", error: "Fork failed. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return stream;
}
