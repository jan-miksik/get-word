import { eq, and, sql, isNull, gt, inArray } from "drizzle-orm";
import { db } from "../client";
import {
  userProgress,
  wordListItems,
  wordLists,
  type UserProgress,
  type NewUserProgress,
} from "../schema";
import { STAGES } from "@/lib/words";
import { computeContentKey } from "@/lib/progress-key";

/**
 * Either the top-level `db` instance or a transaction handle from
 * `db.transaction(...)`. Both expose the methods (insert / select / etc.) we
 * use here, so callers can opt into running a query inside a transaction
 * without the query helpers having to know which one they got. We derive the
 * transaction-handle type from drizzle's own callback signature to stay in
 * sync with the installed version.
 */
type TxHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | TxHandle;

/** Minimal item shape needed to project content-keyed progress onto items. */
export type ProgressItemIdentity = {
  id: string;
  textKnown: string | null;
  textTarget: string | null;
  ignoreCase?: boolean | null;
  languageFrom?: string | null;
  languageTo?: string | null;
};

/**
 * Build the wire `progress` map keyed by word_list_item id, by projecting the
 * user's content-keyed progress rows onto the given items.
 *
 * This is the read counterpart of the content-keyed write path: each item's
 * *current* content key is recomputed and used to look up its progress row, so
 * the same row is shared across every list whose item normalizes to that key,
 * and an edited item (new key, no row) correctly resets to stage 0 — there is
 * no stale item-id lookup. Legacy `word_id`-only rows pass through keyed by
 * word_id. With `since`, only rows changed after the cursor are considered
 * (delta path); items matching a changed content row are emitted.
 */
export async function getProjectedProgress(
  userId: string,
  items: ProgressItemIdentity[],
  options?: { since?: Date }
): Promise<Record<string, UserProgress>> {
  const conditions = [
    eq(userProgress.userId, userId),
    isNull(userProgress.archivedAt),
  ];
  if (options?.since) {
    conditions.push(gt(userProgress.updatedAt, options.since));
  }
  const rows = await db
    .select()
    .from(userProgress)
    .where(and(...conditions));

  const byContentKey = new Map<string, UserProgress>();
  const result: Record<string, UserProgress> = {};
  for (const row of rows) {
    if (row.contentKey) {
      byContentKey.set(row.contentKey, row);
    } else if (row.wordId) {
      // Legacy passthrough (pre-content-key rows).
      result[row.wordId] = row;
    }
  }

  if (byContentKey.size > 0) {
    await Promise.all(
      items.map(async (item) => {
        const key = await computeContentKey({
          languageFrom: item.languageFrom ?? "",
          languageTo: item.languageTo ?? "",
          textKnown: item.textKnown,
          textTarget: item.textTarget,
          ignoreCase: item.ignoreCase ?? false,
        });
        if (!key) return;
        const row = byContentKey.get(key);
        if (row) result[item.id] = row;
      })
    );
  }

  return result;
}

// Get progress for a specific word
async function getWordProgress(
  userId: string,
  wordId: string,
  executor: Executor = db
): Promise<UserProgress | null> {
  const results = await executor
    .select()
    .from(userProgress)
    .where(
      and(eq(userProgress.userId, userId), eq(userProgress.wordId, wordId))
    )
    .limit(1);
  return results[0] || null;
}

async function getWordProgressByContentKey(
  userId: string,
  contentKey: string,
  executor: Executor = db
): Promise<UserProgress | null> {
  const results = await executor
    .select()
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, userId),
        eq(userProgress.contentKey, contentKey)
      )
    )
    .limit(1);
  return results[0] || null;
}

/**
 * Server-authoritative content-key resolver. Given word_list_item ids, returns
 * a map of itemId → content key ("v1:…") or `null` when the item can't form a
 * key (empty target). Computed from canonical DB item text + list languages +
 * the item's `ignoreCase`, so a client-sent key is never trusted.
 */
export async function getContentKeysForItemIds(
  itemIds: string[],
  executor: Executor = db
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const unique = [...new Set(itemIds.filter(Boolean))];
  if (unique.length === 0) return result;

  const rows = await executor
    .select({
      id: wordListItems.id,
      textKnown: wordListItems.textKnown,
      textTarget: wordListItems.textTarget,
      ignoreCase: wordListItems.ignoreCase,
      languageFrom: wordLists.languageFrom,
      languageTo: wordLists.languageTo,
    })
    .from(wordListItems)
    .innerJoin(wordLists, eq(wordListItems.listId, wordLists.id))
    .where(inArray(wordListItems.id, unique));

  await Promise.all(
    rows.map(async (row) => {
      const key = await computeContentKey({
        languageFrom: row.languageFrom,
        languageTo: row.languageTo,
        textKnown: row.textKnown,
        textTarget: row.textTarget,
        ignoreCase: row.ignoreCase,
      });
      result.set(row.id, key);
    })
  );
  return result;
}

/**
 * Options controlling how `batchUpsertProgress*` reconciles with existing
 * rows.
 *
 * When `lww: true`, the upsert only overwrites an existing row if the
 * incoming `updatedAt` is strictly newer. Callers must populate `updatedAt`
 * on every input (typically from the client's wall-clock). This is the right
 * mode for client-originated writes (`setCustomStage`, drag interactions)
 * where a stale outbox replay could otherwise clobber fresher state from
 * another tab or device.
 *
 * When `eventOccurredAt` is set, the upsert is a server-driven event fold
 * (`applyReviewEventToProgress`) that must NOT clobber a newer client write.
 * The row's prior state has already been folded into the new values inside a
 * transaction, but a review event whose `occurredAt` predates the row's latest
 * recorded activity is stale relative to a later manual interval selection
 * (`setCustomStage`) — applying it would silently revert the user's chosen
 * "repeat in 1 day" back to a short "5 minutes". The guard skips the write in
 * that case; otherwise it applies and stamps `updatedAt = now()` (server clock)
 * so the delta cursor still surfaces the change to other devices.
 *
 * When both `lww` and `eventOccurredAt` are unset/false, the upsert overwrites
 * unconditionally and stamps `updatedAt = now()` server-side.
 */
type UpsertOptions = { lww?: boolean; eventOccurredAt?: Date };

function progressLwwSetWhere() {
  return sql`excluded.updated_at > CASE
    WHEN ${userProgress.lastKnownAt} IS NULL AND ${userProgress.lastUnknownAt} IS NULL
      THEN ${userProgress.updatedAt}
    ELSE GREATEST(
      COALESCE(${userProgress.lastKnownAt}, 'epoch'::timestamp),
      COALESCE(${userProgress.lastUnknownAt}, 'epoch'::timestamp)
    )
  END`;
}

// Guard for the event-fold path: apply only when this event is at least as
// recent as the row's latest recorded activity. `occurredAt` (the event's own
// timestamp) is compared directly rather than via `excluded.*`, because the
// folded row carries the *other* activity timestamp forward from the current
// row, so `GREATEST(excluded.last_known_at, excluded.last_unknown_at)` would
// mask a stale event behind the newer write it is trying to revert.
function progressEventGuardSetWhere(occurredAt: Date) {
  return sql`${occurredAt.toISOString()}::timestamp >= GREATEST(
    COALESCE(${userProgress.lastKnownAt}, 'epoch'::timestamp),
    COALESCE(${userProgress.lastUnknownAt}, 'epoch'::timestamp)
  )`;
}

// Resolve the `updatedAt` value and optional `setWhere` for an upsert's
// ON CONFLICT DO UPDATE from the three reconciliation modes, keeping both
// batch upserters in sync.
function progressConflictReconciliation(options: UpsertOptions): {
  updatedAt: ReturnType<typeof sql> | Date;
  setWhere?: ReturnType<typeof sql>;
} {
  if (options.eventOccurredAt) {
    return {
      updatedAt: new Date(),
      setWhere: progressEventGuardSetWhere(options.eventOccurredAt),
    };
  }
  if (options.lww === true) {
    return { updatedAt: sql`excluded.updated_at`, setWhere: progressLwwSetWhere() };
  }
  return { updatedAt: new Date() };
}

// Batch upsert progress (legacy: conflicts on userId + wordId)
export async function batchUpsertProgress(
  progressList: Omit<NewUserProgress, "id" | "createdAt">[],
  executor: Executor = db,
  options: UpsertOptions = {}
): Promise<void> {
  if (progressList.length === 0) return;

  const BATCH_SIZE = 100;
  const { updatedAt, setWhere } = progressConflictReconciliation(options);

  for (let i = 0; i < progressList.length; i += BATCH_SIZE) {
    const batch = progressList.slice(i, i + BATCH_SIZE);

    await executor
      .insert(userProgress)
      .values(batch)
      .onConflictDoUpdate({
        target: [userProgress.userId, userProgress.wordId],
        set: {
          stageIndex: sql`excluded.stage_index`,
          knownCount: sql`excluded.known_count`,
          unknownCount: sql`excluded.unknown_count`,
          lastKnownAt: sql`excluded.last_known_at`,
          lastUnknownAt: sql`excluded.last_unknown_at`,
          nextDueAt: sql`excluded.next_due_at`,
          introducedAt: sql`coalesce(${userProgress.introducedAt}, excluded.introduced_at)`,
          archivedAt: null,
          updatedAt,
        },
        ...(setWhere ? { setWhere } : {}),
      });
  }
}

// Batch upsert progress by content key (new identity path). Each row MUST carry
// a non-null `contentKey`; rows without one are dropped (the caller short-circuits
// items that can't form a key). `wordListItemId` is stamped as informational
// "last item reviewed" metadata and refreshed on conflict.
export async function batchUpsertProgressByContentKey(
  progressList: Omit<NewUserProgress, "id" | "createdAt">[],
  executor: Executor = db,
  options: UpsertOptions = {}
): Promise<void> {
  const rows = progressList.filter((p) => p.contentKey);
  if (rows.length === 0) return;

  const BATCH_SIZE = 100;
  const { updatedAt, setWhere } = progressConflictReconciliation(options);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    await executor
      .insert(userProgress)
      .values(batch)
      .onConflictDoUpdate({
        target: [userProgress.userId, userProgress.contentKey],
        targetWhere: sql`${userProgress.contentKey} IS NOT NULL`,
        set: {
          wordListItemId: sql`excluded.word_list_item_id`,
          stageIndex: sql`excluded.stage_index`,
          knownCount: sql`excluded.known_count`,
          unknownCount: sql`excluded.unknown_count`,
          lastKnownAt: sql`excluded.last_known_at`,
          lastUnknownAt: sql`excluded.last_unknown_at`,
          nextDueAt: sql`excluded.next_due_at`,
          introducedAt: sql`coalesce(${userProgress.introducedAt}, excluded.introduced_at)`,
          archivedAt: null,
          updatedAt,
        },
        ...(setWhere ? { setWhere } : {}),
      });
  }
}

export type ReviewProgressAction = "known" | "really_known" | "unknown";

export interface ReviewProgressTransition {
  eventKind: 'introduction' | 'review';
  previousDueAt: Date | null;
  previousStageIndex: number;
  introducedAt: Date;
}

export async function applyReviewEventToProgress(
  args: {
    userId: string;
    wordId?: string | null;
    wordListItemId?: string | null;
    action: ReviewProgressAction;
    occurredAt: Date;
  },
  executor: Executor = db
): Promise<ReviewProgressTransition | null> {
  const { userId, wordId, wordListItemId, action, occurredAt } = args;
  if (!wordId && !wordListItemId) return null;

  // New path: identity is the content key. Resolve it server-side from the item.
  // If the item can't form a key (empty target), skip progress entirely.
  let contentKey: string | null = null;
  if (wordListItemId) {
    const keys = await getContentKeysForItemIds([wordListItemId], executor);
    contentKey = keys.get(wordListItemId) ?? null;
    if (!contentKey) return null;
  }

  const current = contentKey
    ? await getWordProgressByContentKey(userId, contentKey, executor)
    : await getWordProgress(userId, wordId!, executor);

  const currentStageIndex = current?.stageIndex ?? 0;
  const knownCount = current?.knownCount ?? 0;
  const unknownCount = current?.unknownCount ?? 0;
  const alreadyIntroduced = Boolean(current?.introducedAt) || knownCount + unknownCount > 0;
  const introducedAt = current?.introducedAt ?? (alreadyIntroduced
    ? (current?.lastKnownAt ?? current?.lastUnknownAt ?? current?.createdAt ?? occurredAt)
    : occurredAt);

  let stageIndex = currentStageIndex;
  let nextKnownCount = knownCount;
  let nextUnknownCount = unknownCount;
  let lastKnownAt = current?.lastKnownAt ?? null;
  let lastUnknownAt = current?.lastUnknownAt ?? null;

  if (action === "known") {
    stageIndex = Math.min(currentStageIndex + 1, STAGES.length - 1);
    nextKnownCount += 1;
    lastKnownAt = occurredAt;
  } else if (action === "really_known") {
    stageIndex = Math.min(currentStageIndex + 2, STAGES.length - 1);
    nextKnownCount += 1;
    lastKnownAt = occurredAt;
  } else {
    stageIndex = Math.max(currentStageIndex - 1, 0);
    nextUnknownCount += 1;
    lastUnknownAt = occurredAt;
  }

  const intervalMs = STAGES[stageIndex]?.intervalMs ?? 0;
  // Mirror of the client fold: a word retired as "fully known" (top stage, no
  // due date) stays retired when answered right again. Only an "unknown" puts
  // it back into the rotation.
  const staysRetired =
    action !== "unknown" &&
    currentStageIndex === STAGES.length - 1 &&
    !current?.nextDueAt;
  const nextDueAt = staysRetired || intervalMs <= 0
    ? null
    : new Date(occurredAt.getTime() + intervalMs);

  const values = {
    userId,
    wordId: contentKey ? null : wordId!,
    wordListItemId: wordListItemId ?? null,
    contentKey,
    stageIndex,
    knownCount: nextKnownCount,
    unknownCount: nextUnknownCount,
    lastKnownAt,
    lastUnknownAt,
    nextDueAt,
    introducedAt,
  };

  // Guard the fold against reverting a newer client write (e.g. a manual
  // `setCustomStage` "repeat in 1 day" that landed after this event was
  // created but before it reached the server). Without this, a stale review
  // event would drop the stage a notch and recompute `nextDueAt` from its own
  // older timestamp — the reported "1 day silently becomes 5 minutes" bug.
  if (contentKey) {
    await batchUpsertProgressByContentKey([values], executor, {
      eventOccurredAt: occurredAt,
    });
  } else {
    await batchUpsertProgress([values], executor, { eventOccurredAt: occurredAt });
  }
  return {
    eventKind: alreadyIntroduced ? 'review' : 'introduction',
    previousDueAt: current?.nextDueAt ?? null,
    previousStageIndex: currentStageIndex,
    introducedAt,
  };
}
