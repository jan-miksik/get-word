import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { isPlayableAudioAsset } from "@/lib/audio-assets";
import { findMediaByHashes } from "@/lib/db";
import { db } from "@/lib/db/client";
import type { Executor } from "@/lib/db/queries/executor";
import {
  userListSubscriptions,
  users,
  wordCategories,
  wordChatCommits,
  wordListItems,
  wordLists,
  type WordListItem,
} from "@/lib/db/schema";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { buildContentKeyInput, computeContentKey } from "@/lib/progress-key";
import { personalListName } from "../personal-list-name";
import { firstMeaningfulTopicLabel } from "../topicLabels";
import type { LearnerBrief } from "@/lib/learner-brief";
import { randomUUID } from "node:crypto";
import { isAddressFormValue, makeAddressForm } from "@/lib/word-item-address-form";
import {
  limitKeepingPrimaries,
  validAddressFormGroups,
} from "../addressFormPairs";
import {
  MAX_ITEMS_PER_SESSION,
  MAX_WORD_CHAT_ID_CHARS,
  MAX_WORD_CHAT_ITEM_CHARS,
} from "./config";
import { regenerateLearnerBrief } from "./brief";
import { getPersonalList } from "./personal-list";
import {
  getMonthlyItemUsage,
  reserveMonthlyItems,
  type WordChatRole,
} from "./rate-limit";
import { recordWordChatUsage } from "./usage";
import type { CommitRequest, CommitResult, ReviewItem } from "../types";

export class WordChatCommitError extends Error {
  readonly code = "WORD_CHAT_COMMIT_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "WordChatCommitError";
  }
}

const TRANSIENT_DB_CODES = new Set([
  "40001",
  "40P01",
  "53300",
  "57014",
  "08000",
  "08003",
  "08006",
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "CONNECT_TIMEOUT",
]);

function isTransientDbError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && TRANSIENT_DB_CODES.has(code);
}

/**
 * Drop empty and exact duplicate pairs, then fit the batch inside the limit.
 *
 * The ORDER of the stages matters and is the whole point:
 *
 *   1. normalize + dedupe
 *   2. re-validate the address-form groups the client declared
 *   3. apply the limit, primaries first
 *   4. mint a persistent `groupId` — only for pairs that survived all of that
 *
 * Minting in step 4 rather than step 2 is what stops a primary row from keeping
 * a `groupId` pointing at a pair that no longer exists, whether its twin was
 * removed by dedupe or squeezed out by the limit. In that case the row keeps its
 * `form`, which is still true of it, and simply stands alone.
 *
 * `limit` is the caller's effective cap (session cap ∩ remaining monthly
 * balance). It defaults to the session cap so existing callers are unchanged.
 */
export function sanitizeReviewItems(
  items: ReviewItem[],
  limit: number = MAX_ITEMS_PER_SESSION,
): ReviewItem[] {
  const seen = new Set<string>();
  const deduped: ReviewItem[] = [];
  for (const item of items) {
    const textKnown =
      item.textKnown?.trim().replace(/\s+/g, " ").slice(0, MAX_WORD_CHAT_ITEM_CHARS) ?? "";
    const textTarget =
      item.textTarget?.trim().replace(/\s+/g, " ").slice(0, MAX_WORD_CHAT_ITEM_CHARS) ?? "";
    const key = buildContentKeyInput({
      languageFrom: "_from",
      languageTo: "_to",
      textKnown,
      textTarget,
    });
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const normalized: ReviewItem = { ...item, textKnown, textTarget };
    if (!isAddressFormValue(item.addressForm?.form)) {
      delete normalized.addressForm;
      delete normalized.variantGroupKey;
    } else {
      normalized.addressForm = { form: item.addressForm.form };
      const groupKey =
        typeof item.variantGroupKey === "string"
          ? item.variantGroupKey.trim().slice(0, MAX_WORD_CHAT_ID_CHARS)
          : "";
      if (groupKey) normalized.variantGroupKey = groupKey;
      else delete normalized.variantGroupKey;
    }
    deduped.push(normalized);
  }

  // A group key the client sent is only a claim. Anything that fails the
  // invariants — wrong size, mismatched source, identical targets, two of the
  // same form — is stripped now, so the limit below treats those rows as the
  // independent items they actually are.
  const validAfterDedupe = validAddressFormGroups(deduped);
  const claimed = deduped.map((item) =>
    item.variantGroupKey && validAfterDedupe.has(item.variantGroupKey)
      ? item
      : stripGroupKey(item),
  );

  const limited = limitKeepingPrimaries(claimed, Math.max(0, Math.min(limit, MAX_ITEMS_PER_SESSION)));

  // Re-checked against what actually survived: a pair whose twin lost its place
  // to the limit is no longer a pair.
  const surviving = validAddressFormGroups(limited);
  return limited.map((item) =>
    item.variantGroupKey && surviving.has(item.variantGroupKey)
      ? item
      : stripGroupKey(item),
  );
}

/** Keep the form (still true of this row), drop the group claim. */
function stripGroupKey(item: ReviewItem): ReviewItem {
  if (!item.variantGroupKey) return item;
  const rest = { ...item };
  delete rest.variantGroupKey;
  return rest;
}

/**
 * Persistent group ids for the pairs that survived `sanitizeReviewItems`.
 * Keyed by the transient client key; every row without an entry is stored with
 * a bare `{ form }` or nothing at all.
 */
export function mintAddressFormGroupIds(items: ReviewItem[]): Map<string, string> {
  const ids = new Map<string, string>();
  const validGroups = validAddressFormGroups(items);
  for (const item of items) {
    if (
      !item.variantGroupKey ||
      !validGroups.has(item.variantGroupKey) ||
      ids.has(item.variantGroupKey)
    ) continue;
    ids.set(item.variantGroupKey, randomUUID());
  }
  return ids;
}

async function findCommit(executor: Executor, creationKey: string) {
  const [row] = await executor
    .select()
    .from(wordChatCommits)
    .where(eq(wordChatCommits.creationKey, creationKey))
    .limit(1);
  return row ?? null;
}

async function committedResult(input: {
  creationKey: string;
  userId: string;
  role: WordChatRole;
}): Promise<CommitResult | null> {
  const row = await findCommit(db, input.creationKey);
  if (!row?.committedAt || !row.listId) return null;
  if (row.userId !== input.userId) {
    throw new WordChatCommitError("This creation key belongs to another user.");
  }
  const usage = await getMonthlyItemUsage({ userId: input.userId, role: input.role });
  return {
    listId: row.listId,
    categoryId: row.categoryId,
    itemCount: row.itemCount,
    takeoverCount: row.takeoverCount,
    upgradedTakeoverCount: row.upgradedTakeoverCount,
    alreadyCommitted: true,
    monthlyUsed: usage.used,
    monthlyLimit: usage.limit,
  };
}

async function findOrCreatePersonalList(
  executor: Executor,
  input: {
    userId: string;
    languageFrom: string;
    languageTo: string;
    listName: string;
    isPublic: boolean;
    reviewOptIn: boolean;
  },
) {
  const existing = await getPersonalList(input, executor);
  if (existing) {
    if (existing.name !== input.listName) {
      const [updated] = await executor
        .update(wordLists)
        .set({ name: input.listName, updatedAt: new Date() })
        .where(eq(wordLists.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }

  await executor
    .insert(wordLists)
    .values({
      ownerId: input.userId,
      name: input.listName,
      languageFrom: input.languageFrom,
      languageTo: input.languageTo,
      isPersonal: true,
      isPublic: input.isPublic,
      reviewOptIn: input.reviewOptIn,
    })
    .onConflictDoNothing();

  const created = await getPersonalList(input, executor);
  if (!created) {
    throw new WordChatCommitError("Could not create your personal word list.");
  }
  return created;
}

type SourceRow = WordListItem & {
  listName: string;
  languageFrom: string;
  languageTo: string;
  ownerId: string | null;
  isPersonal: boolean;
  eligible: boolean;
};

async function loadSources(
  executor: Executor,
  input: { userId: string; ids: string[] },
): Promise<Map<string, SourceRow>> {
  if (input.ids.length === 0) return new Map();
  const rows = await executor
    .select({
      ...getTableColumns(wordListItems),
      listName: wordLists.name,
      languageFrom: wordLists.languageFrom,
      languageTo: wordLists.languageTo,
      ownerId: wordLists.ownerId,
      isPersonal: wordLists.isPersonal,
      eligible: sql<boolean>`(
        ${wordLists.ownerId} = ${input.userId}
        or exists (
          select 1
          from ${userListSubscriptions}
          where ${userListSubscriptions.userId} = ${input.userId}
            and ${userListSubscriptions.listId} = ${wordLists.id}
        )
      )`,
    })
    .from(wordListItems)
    .innerJoin(wordLists, eq(wordListItems.listId, wordLists.id))
    .where(inArray(wordListItems.id, input.ids));

  return new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        listName: row.listName,
        languageFrom: row.languageFrom,
        languageTo: row.languageTo,
        ownerId: row.ownerId,
        isPersonal: row.isPersonal,
        eligible: Boolean(row.eligible),
      },
    ]),
  );
}

async function contentKeyForItem(
  item: Pick<WordListItem, "textKnown" | "textTarget" | "ignoreCase">,
  languageFrom: string,
  languageTo: string,
) {
  return computeContentKey({
    languageFrom,
    languageTo,
    textKnown: item.textKnown,
    textTarget: item.textTarget,
    ignoreCase: item.ignoreCase,
  });
}

/**
 * Commit reviewed rows into the canonical personal list.
 *
 * The commit ledger owns idempotency. The personal-list row lock serializes
 * content-key checks, while the two partial unique indexes are the final guard
 * against concurrent first-list creation and duplicate takeover identities.
 */
export async function commitWordChatSession(input: {
  userId: string;
  role: WordChatRole;
  request: CommitRequest;
}): Promise<CommitResult> {
  const { request } = input;
  const languageFrom = normalizeLanguageCode(request.languageFrom);
  const languageTo = normalizeLanguageCode(request.languageTo);
  const chatLanguage = normalizeLanguageCode(request.chatLanguage) || languageFrom;
  if (!languageFrom || !languageTo || languageFrom === languageTo) {
    throw new WordChatCommitError("A valid language pair is required.");
  }

  const creationKey = request.creationKey?.trim().slice(0, MAX_WORD_CHAT_ID_CHARS);
  if (!creationKey) throw new WordChatCommitError("A creation key is required.");

  const existingCommit = await committedResult({
    creationKey,
    userId: input.userId,
    role: input.role,
  });
  if (existingCommit) return existingCommit;

  // The monthly balance is enforced HERE, not on the client: a stale tab, a
  // second tab, or a hand-made request must not be able to overshoot it. This
  // matters more now that one translated row can become two saved items.
  const usageBeforeCommit = await getMonthlyItemUsage({
    userId: input.userId,
    role: input.role,
  });
  const monthlyRemaining = Math.max(0, usageBeforeCommit.limit - usageBeforeCommit.used);
  const effectiveLimit = Math.min(MAX_ITEMS_PER_SESSION, monthlyRemaining);

  const items = sanitizeReviewItems(request.items ?? [], effectiveLimit);
  if (items.length === 0) throw new WordChatCommitError("There is nothing to save.");

  // Rows picked off a photo name their clip by content hash: the lab generated
  // it and never learned the asset id. Resolving it here is what keeps those
  // words audible instead of silently re-voiced later.
  const hashesToResolve = [
    ...new Set(
      items
        .filter((item) => !item.audioAssetId)
        .map((item) => item.audioHash)
        .filter((hash): hash is string => Boolean(hash)),
    ),
  ];
  const assetIdByHash = new Map<string, string>();
  if (hashesToResolve.length > 0) {
    for (const [hash, asset] of await findMediaByHashes(hashesToResolve)) {
      if (isPlayableAudioAsset(asset)) assetIdByHash.set(hash, asset.id);
    }
  }
  const audioAssetIdFor = (item: ReviewItem): string | null =>
    item.audioAssetId ?? (item.audioHash ? assetIdByHash.get(item.audioHash) ?? null : null);

  const categoryName = request.categoryName?.trim().slice(0, 60) || "My words";
  // The category is editable and may contain a name; only the dedicated,
  // privacy-constrained label is safe to feed into the cross-session brief.
  const topicLabel = firstMeaningfulTopicLabel(request.topicLabel?.trim().slice(0, 60));
  const reviewLabel = request.reviewLabel?.trim().slice(0, 60) || null;
  const listName =
    request.listName?.trim().replace(/\s+/g, " ").slice(0, 80) ||
    personalListName(languageFrom, languageTo);

  const existingList = await getPersonalList({
    userId: input.userId,
    languageFrom,
    languageTo,
  });
  const previousBrief: LearnerBrief | null = existingList?.learnerBrief ?? null;
  const brief = await regenerateLearnerBrief({
    userId: input.userId,
    sessionId: request.sessionId,
    previousBrief,
    messages: request.messages ?? [],
    committedTopic: topicLabel,
    chatLanguage,
  });

  const runCommitTransaction = () =>
    db.transaction(async (tx) => {
      const [claim] = await tx
        .insert(wordChatCommits)
        .values({
          creationKey,
          userId: input.userId,
          sessionId: request.sessionId,
        })
        .onConflictDoNothing()
        .returning();

      if (!claim) {
        const winner = await findCommit(tx, creationKey);
        if (!winner?.committedAt || !winner.listId) {
          throw new WordChatCommitError("Could not resolve this saved set. Please try again.");
        }
        if (winner.userId !== input.userId) {
          throw new WordChatCommitError("This creation key belongs to another user.");
        }
        return {
          listId: winner.listId,
          categoryId: winner.categoryId,
          itemCount: winner.itemCount,
          takeoverCount: winner.takeoverCount,
          upgradedTakeoverCount: winner.upgradedTakeoverCount,
          alreadyCommitted: true,
        };
      }

      const list = await findOrCreatePersonalList(tx, {
        userId: input.userId,
        languageFrom,
        languageTo,
        listName,
        isPublic: request.isPublic === true,
        reviewOptIn: request.reviewOptIn !== false,
      });

      await tx
        .select({ id: wordLists.id })
        .from(wordLists)
        .where(eq(wordLists.id, list.id))
        .for("update");

      const sourceIds = [
        ...new Set(
          items.flatMap((item) =>
            [item.corpusItemId, item.takeover?.sourceItemId].filter(
              (id): id is string => Boolean(id),
            ),
          ),
        ),
      ];
      const [sourceRows, existingRows] = await Promise.all([
        loadSources(tx, { userId: input.userId, ids: sourceIds }),
        tx.select().from(wordListItems).where(eq(wordListItems.listId, list.id)),
      ]);

      const existingByKey = new Map<string, WordListItem>();
      const existingByTakeover = new Map<string, WordListItem>();
      for (const row of existingRows) {
        const key = await contentKeyForItem(row, languageFrom, languageTo);
        if (key && !existingByKey.has(key)) existingByKey.set(key, row);
        if (row.takeoverSourceItemId) existingByTakeover.set(row.takeoverSourceItemId, row);
      }

      type Prepared = {
        item: ReviewItem;
        key: string;
        source: SourceRow | null;
        takeover: SourceRow | null;
      };
      const inserts: Prepared[] = [];
      let takeoverCount = 0;
      let upgradedTakeoverCount = 0;

      for (const item of items) {
        const corpusSource = item.corpusItemId
          ? sourceRows.get(item.corpusItemId) ?? null
          : null;
        let provenance: SourceRow | null = null;
        if (
          corpusSource &&
          !corpusSource.isPersonal &&
          normalizeLanguageCode(corpusSource.languageFrom) === languageFrom &&
          normalizeLanguageCode(corpusSource.languageTo) === languageTo
        ) {
          const [sourceKey, reviewKey] = await Promise.all([
            contentKeyForItem(
              corpusSource,
              corpusSource.languageFrom,
              corpusSource.languageTo,
            ),
            computeContentKey({
              languageFrom,
              languageTo,
              textKnown: item.textKnown,
              textTarget: item.textTarget,
              ignoreCase: corpusSource.ignoreCase,
            }),
          ]);
          if (sourceKey && sourceKey === reviewKey) provenance = corpusSource;
        }

        const requestedTakeoverId = item.takeover?.sourceItemId;
        const requestedSource = requestedTakeoverId
          ? sourceRows.get(requestedTakeoverId) ?? null
          : null;
        let takeover: SourceRow | null = null;

        if (
          requestedSource &&
          requestedSource.eligible &&
          !requestedSource.isPersonal &&
          normalizeLanguageCode(requestedSource.languageFrom) === languageFrom &&
          normalizeLanguageCode(requestedSource.languageTo) === languageTo
        ) {
          const [sourceKey, reviewKey] = await Promise.all([
            contentKeyForItem(
              requestedSource,
              requestedSource.languageFrom,
              requestedSource.languageTo,
            ),
            computeContentKey({
              languageFrom,
              languageTo,
              textKnown: item.textKnown,
              textTarget: item.textTarget,
              ignoreCase: requestedSource.ignoreCase,
            }),
          ]);
          if (sourceKey && sourceKey === reviewKey) takeover = requestedSource;
        }

        const key = await computeContentKey({
          languageFrom,
          languageTo,
          textKnown: item.textKnown,
          textTarget: item.textTarget,
          ignoreCase: takeover?.ignoreCase ?? false,
        });
        if (!key) continue;

        const existing = existingByKey.get(key);
        if (existing) {
          if (
            takeover &&
            !existing.takeoverSourceItemId &&
            !existingByTakeover.has(takeover.id)
          ) {
            await tx
              .update(wordListItems)
              .set({
                takeoverSourceItemId: takeover.id,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(wordListItems.id, existing.id),
                  sql`${wordListItems.takeoverSourceItemId} is null`,
                ),
              );
            existing.takeoverSourceItemId = takeover.id;
            existingByTakeover.set(takeover.id, existing);
            takeoverCount += 1;
            upgradedTakeoverCount += 1;
          }
          continue;
        }
        if (takeover && existingByTakeover.has(takeover.id)) continue;

        const source = provenance ?? takeover;
        const prepared = { item, key, source, takeover };
        inserts.push(prepared);
        // Reserve the key immediately so two rows that normalize identically
        // after source metadata is applied cannot enter this same batch twice.
        existingByKey.set(key, {
          id: `pending:${inserts.length}`,
        } as WordListItem);
        if (takeover) {
          existingByTakeover.set(takeover.id, {
            id: `pending:${inserts.length}`,
          } as WordListItem);
          takeoverCount += 1;
        }
      }

      let categoryId: string | null = null;
      if (inserts.length > 0) {
        // Database dedupe can remove one member even after the request-level
        // pair survived. Mint ids from the rows that will ACTUALLY be inserted,
        // so an existing primary never leaves its newly inserted alternative
        // pointing at a twin that was not part of this write.
        const addressFormGroupIds = mintAddressFormGroupIds(
          inserts.map(({ item }) => item),
        );
        await reserveMonthlyItems({
          userId: input.userId,
          role: input.role,
          count: inserts.length,
          executor: tx,
        });

        const [{ nextPosition }] = await tx
          .select({
            nextPosition: sql<number>`coalesce(max(${wordCategories.position}), -1) + 1`,
          })
          .from(wordCategories)
          .where(eq(wordCategories.listId, list.id));
        const [category] = await tx
          .insert(wordCategories)
          .values({
            listId: list.id,
            name: categoryName,
            position: Number(nextPosition ?? 0),
            creationKey,
            reviewLabel,
          })
          .returning();
        if (!category) throw new WordChatCommitError("Could not create the category.");
        categoryId = category.id;

        const [{ nextItemPosition }] = await tx
          .select({
            nextItemPosition: sql<number>`coalesce(max(${wordListItems.position}), -1) + 1`,
          })
          .from(wordListItems)
          .where(eq(wordListItems.listId, list.id));
        const basePosition = Number(nextItemPosition ?? 0);

        await tx.insert(wordListItems).values(
          inserts.map(({ item, source, takeover }, index) => ({
            listId: list.id,
            categoryId,
            position: basePosition + index,
            textKnown: item.textKnown,
            textTarget: item.textTarget,
            sourceItemId: source?.id ?? null,
            takeoverSourceItemId: takeover?.id ?? null,
            ignoreCase: takeover?.ignoreCase ?? false,
            acceptedKnown: takeover?.acceptedKnown ?? [],
            acceptedTarget: takeover?.acceptedTarget ?? [],
            notes: takeover?.notes ?? null,
            comment: takeover?.comment ?? null,
            addressForm: item.addressForm
              ? makeAddressForm(
                  item.addressForm.form,
                  item.variantGroupKey
                    ? addressFormGroupIds.get(item.variantGroupKey)
                    : undefined,
                )
              : null,
            translationStatus: "translated" as const,
            audioAssetId: audioAssetIdFor(item) ?? takeover?.audioAssetId ?? null,
            audioStatus:
              audioAssetIdFor(item) || takeover?.audioAssetId
                ? ("ready" as const)
                : ("none" as const),
            knownAudioAssetId:
              item.knownAudioAssetId ?? takeover?.knownAudioAssetId ?? null,
            knownAudioStatus:
              item.knownAudioAssetId || takeover?.knownAudioAssetId
                ? ("ready" as const)
                : ("none" as const),
          })),
        );

        await tx
          .update(users)
          .set({
            pinnedCategoryIds: sql`(
              select array_agg(distinct id)
              from unnest(array[${categoryId}::uuid] || ${users.pinnedCategoryIds}) as id
            )`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, input.userId));
      }

      await tx
        .update(wordLists)
        .set({ learnerBrief: brief, updatedAt: new Date() })
        .where(eq(wordLists.id, list.id));

      await tx
        .update(wordChatCommits)
        .set({
          listId: list.id,
          categoryId,
          itemCount: inserts.length,
          takeoverCount,
          upgradedTakeoverCount,
          committedAt: new Date(),
        })
        .where(eq(wordChatCommits.creationKey, creationKey));

      return {
        listId: list.id,
        categoryId,
        itemCount: inserts.length,
        takeoverCount,
        upgradedTakeoverCount,
        alreadyCommitted: false,
      };
    });

  let result: Awaited<ReturnType<typeof runCommitTransaction>>;
  try {
    result = await runCommitTransaction();
  } catch (err) {
    if (!isTransientDbError(err)) throw err;
    console.warn("[word-chat] commit transaction failed transiently, retrying once", {
      error: err instanceof Error ? err.message : String(err),
      code: (err as { code?: unknown }).code,
    });
    result = await runCommitTransaction();
  }

  const usage = await getMonthlyItemUsage({ userId: input.userId, role: input.role });
  if (!result.alreadyCommitted) {
    await recordWordChatUsage({
      userId: input.userId,
      sessionId: request.sessionId,
      callType: "proposal",
      stage: "committed",
      model: "n/a",
      itemCount: result.itemCount,
    });
  }

  return {
    ...result,
    monthlyUsed: usage.used,
    monthlyLimit: usage.limit,
  };
}
