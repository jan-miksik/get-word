import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { Executor } from "@/lib/db/queries/executor";
import { users, wordCategories, wordListItems, wordLists } from "@/lib/db/schema";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { personalListName } from "../personal-list-name";
import type { LearnerBrief } from "@/lib/learner-brief";
import { MAX_ITEMS_PER_SESSION } from "./config";
import { regenerateLearnerBrief } from "./brief";
import { dedupKey } from "./corpus";
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

/**
 * Postgres/driver failures that say "the database was momentarily unavailable",
 * not "this write is wrong": serialization conflicts, deadlocks, a statement
 * cancelled by `statement_timeout`, an exhausted or dropped connection.
 *
 * Everything else — a rejected foreign key, a violated constraint — is
 * deterministic and must surface immediately rather than be tried twice.
 */
const TRANSIENT_DB_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "53300", // too_many_connections
  "57014", // query_canceled (statement_timeout)
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "CONNECT_TIMEOUT",
]);

function isTransientDbError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && TRANSIENT_DB_CODES.has(code);
}

/** Drop empties, duplicates, and anything over the session cap. */
export function sanitizeReviewItems(items: ReviewItem[]): ReviewItem[] {
  const seen = new Set<string>();
  const result: ReviewItem[] = [];
  for (const item of items) {
    const textKnown = item.textKnown?.trim().replace(/\s+/g, " ") ?? "";
    const textTarget = item.textTarget?.trim().replace(/\s+/g, " ") ?? "";
    if (!textKnown || !textTarget) continue;
    const key = dedupKey(textKnown);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...item, textKnown, textTarget });
    if (result.length >= MAX_ITEMS_PER_SESSION) break;
  }
  return result;
}

async function findCommittedCategory(executor: Executor, creationKey: string) {
  const [row] = await executor
    .select({
      id: wordCategories.id,
      listId: wordCategories.listId,
    })
    .from(wordCategories)
    .where(eq(wordCategories.creationKey, creationKey))
    .limit(1);
  return row ?? null;
}

/**
 * Find or create the learner's single personal list for this direction.
 *
 * `word_lists_personal_pair_unique` guarantees there is at most one, which is
 * what makes this safe with two tabs open: the loser of the insert race sees a
 * conflict, does nothing, and re-reads the winner's row.
 */
async function findOrCreatePersonalList(
  executor: Executor,
  input: {
    userId: string;
    languageFrom: string;
    languageTo: string;
    isPublic: boolean;
    reviewOptIn: boolean;
  },
) {
  const existing = await getPersonalList(input, executor);
  if (existing) return existing;

  await executor
    .insert(wordLists)
    .values({
      ownerId: input.userId,
      name: personalListName(input.languageFrom, input.languageTo),
      languageFrom: input.languageFrom,
      languageTo: input.languageTo,
      isPersonal: true,
      // Visibility is decided once, on the first session, and belongs to the
      // list from then on. Later sessions add categories and never re-ask.
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

/**
 * Save a reviewed word-chat session.
 *
 * Idempotent: `word_categories.creation_key` is unique, so a double-click, a
 * reload, or a retry with the same key produces one category and one quota
 * charge. The key is checked before any model call so a retry is also free.
 *
 * Atomic: list, category, items, quota, brief and study priority all land in one
 * transaction. A crash halfway must leave nothing — not a category with no quota
 * charged, and not a quota charged with no items.
 *
 * The one honest exception is audio: assets are created during Review, into the
 * content-addressed media pool. Walking away leaves an unreferenced asset that
 * is reusable by content hash and cleanable later.
 */
export async function commitWordChatSession(input: {
  userId: string;
  role: WordChatRole;
  request: CommitRequest;
}): Promise<CommitResult> {
  const { request } = input;
  const languageFrom = normalizeLanguageCode(request.languageFrom);
  const languageTo = normalizeLanguageCode(request.languageTo);
  if (!languageFrom || !languageTo || languageFrom === languageTo) {
    throw new WordChatCommitError("A valid language pair is required.");
  }

  const creationKey = request.creationKey?.trim();
  if (!creationKey) {
    throw new WordChatCommitError("A creation key is required.");
  }

  // Cheap pre-check outside the transaction: an already-committed key must not
  // pay for brief regeneration on the way to discovering it has nothing to do.
  const alreadyCommitted = await findCommittedCategory(db, creationKey);
  if (alreadyCommitted) {
    const usage = await getMonthlyItemUsage({ userId: input.userId, role: input.role });
    const existingCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(wordListItems)
      .where(eq(wordListItems.categoryId, alreadyCommitted.id));
    return {
      listId: alreadyCommitted.listId,
      categoryId: alreadyCommitted.id,
      itemCount: Number(existingCount[0]?.count ?? 0),
      alreadyCommitted: true,
      monthlyUsed: usage.used,
      monthlyLimit: usage.limit,
    };
  }

  const items = sanitizeReviewItems(request.items ?? []);
  if (items.length === 0) {
    throw new WordChatCommitError("There is nothing to save.");
  }

  const categoryName = request.categoryName?.trim().slice(0, 60) || "My words";
  const reviewLabel = request.reviewLabel?.trim().slice(0, 60) || null;

  const existingList = await getPersonalList({
    userId: input.userId,
    languageFrom,
    languageTo,
  });
  const previousBrief: LearnerBrief | null = existingList?.learnerBrief ?? null;

  // Model call FIRST, transaction second.
  const brief = await regenerateLearnerBrief({
    userId: input.userId,
    sessionId: request.sessionId,
    previousBrief,
    messages: request.messages ?? [],
    committedTopic: categoryName,
  });

  const runCommitTransaction = () => db.transaction(async (tx) => {
    // Re-check inside the transaction: two tabs can both pass the pre-check.
    const raced = await findCommittedCategory(tx, creationKey);
    if (raced) {
      return { listId: raced.listId, categoryId: raced.id, alreadyCommitted: true };
    }

    const list = await findOrCreatePersonalList(tx, {
      userId: input.userId,
      languageFrom,
      languageTo,
      isPublic: request.isPublic === true,
      reviewOptIn: request.reviewOptIn !== false,
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
      // The unique index is PARTIAL (`where creation_key is not null`), so the
      // same predicate has to be repeated here — without it Postgres cannot
      // infer an arbiter index and rejects the statement outright (42P10).
      .onConflictDoNothing({
        target: wordCategories.creationKey,
        where: sql`${wordCategories.creationKey} is not null`,
      })
      .returning();

    // The unique index rejected the insert: another tab committed this key
    // between the re-check and here. Nothing else in this transaction has run.
    if (!category) {
      const winner = await findCommittedCategory(tx, creationKey);
      if (!winner) throw new WordChatCommitError("Could not save this set. Please try again.");
      return { listId: winner.listId, categoryId: winner.id, alreadyCommitted: true };
    }

    const [{ nextItemPosition }] = await tx
      .select({
        nextItemPosition: sql<number>`coalesce(max(${wordListItems.position}), -1) + 1`,
      })
      .from(wordListItems)
      .where(eq(wordListItems.listId, list.id));

    const basePosition = Number(nextItemPosition ?? 0);
    await tx.insert(wordListItems).values(
      items.map((item, index) => ({
        listId: list.id,
        categoryId: category.id,
        position: basePosition + index,
        textKnown: item.textKnown,
        textTarget: item.textTarget,
        // Set only when this row reused an existing item's pair. Kept so an
        // item translated by nobody — reused from an unreviewed public list —
        // can still be found once translations carry verification tiers.
        sourceItemId: item.corpusItemId ?? null,
        // Everything here came out of the translation step, machine-generated
        // and not human-checked. `translated` is the honest status; the review
        // notice in the UI is what tells the learner it is unvalidated.
        translationStatus: "translated" as const,
        audioAssetId: item.audioAssetId ?? null,
        audioStatus: item.audioAssetId ? ("ready" as const) : ("none" as const),
        knownAudioAssetId: item.knownAudioAssetId ?? null,
        knownAudioStatus: item.knownAudioAssetId ? ("ready" as const) : ("none" as const),
      })),
    );

    // Charged for what was actually saved, in the same transaction that saved
    // it. Throws DailyLimitError over budget, which rolls everything back.
    await reserveMonthlyItems({
      userId: input.userId,
      role: input.role,
      count: items.length,
      executor: tx,
    });

    await tx
      .update(wordLists)
      .set({ learnerBrief: brief, updatedAt: new Date() })
      .where(eq(wordLists.id, list.id));

    // Own words lead the study stream. Pinned categories are peers with each
    // other; the only product guarantee is that they come before subscribed-list
    // words. Dedupe in SQL so a re-pin cannot grow the array without bound.
    await tx
      .update(users)
      .set({
        pinnedCategoryIds: sql`(
          select array_agg(distinct id)
          from unnest(array[${category.id}::uuid] || ${users.pinnedCategoryIds}) as id
        )`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.userId));

    return { listId: list.id, categoryId: category.id, alreadyCommitted: false };
  });

  // One automatic retry, for transient failures only.
  //
  // This is the moment the learner has already paid for: the conversation, the
  // proposal, the translation and the audio are all done, and a dropped
  // connection or a cancelled statement here throws the whole session back at
  // them. The transaction is all-or-nothing and the creation key makes it
  // idempotent, so re-running it cannot produce a second list or a double
  // charge. Deterministic errors are rethrown untouched.
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
      itemCount: items.length,
    });
  }

  return {
    listId: result.listId,
    categoryId: result.categoryId,
    itemCount: result.alreadyCommitted ? 0 : items.length,
    alreadyCommitted: result.alreadyCommitted,
    monthlyUsed: usage.used,
    monthlyLimit: usage.limit,
  };
}
