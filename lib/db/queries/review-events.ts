import { db } from "../client";
import { reviewEvents } from "../schema";
import { applyReviewEventToProgress, type ReviewProgressAction } from "./progress";

type RecordReviewEventResult = "inserted" | "duplicate" | "skipped";

/**
 * Same shape as `lib/db/queries/progress.ts`: accepts either the top-level `db`
 * or a transaction handle so callers can run a query inside an outer
 * transaction.
 */
type TxHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | TxHandle;

export interface IncomingReviewEvent {
  client_event_id: string;
  word_id?: string;
  word_list_item_id?: string;
  action: ReviewProgressAction;
  client_created_at: number;
}

function toClientDate(timestamp: number): Date {
  const parsed = Number(timestamp);
  return Number.isFinite(parsed) ? new Date(parsed) : new Date();
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const maybeError = error as { code?: unknown; cause?: unknown };
  if (typeof maybeError.code === "string") return maybeError.code;
  return getErrorCode(maybeError.cause);
}

function getErrorStringProperty(error: unknown, key: string): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const maybeError = error as Record<string, unknown>;
  if (typeof maybeError[key] === "string") return maybeError[key];
  return getErrorStringProperty(maybeError.cause, key);
}

function isReviewTargetForeignKeyViolation(error: unknown): boolean {
  if (getErrorCode(error) !== "23503") return false;
  const constraintName = getErrorStringProperty(error, "constraint_name");
  return constraintName?.startsWith("review_events_word") === true;
}

export async function recordReviewEventIfNew(
  args: {
    userId: string;
    deviceId?: string | null;
    sessionId?: string | null;
    event: IncomingReviewEvent;
  },
  executor: Executor = db
): Promise<RecordReviewEventResult> {
  const { userId, deviceId, sessionId, event } = args;
  const clientEventId = String(event.client_event_id ?? "").trim();
  if (!clientEventId) return "skipped";
  if (!event.word_id && !event.word_list_item_id) return "skipped";

  try {
    const inserted = await executor
      .insert(reviewEvents)
      .values({
        userId,
        clientEventId,
        deviceId: deviceId?.trim() || null,
        sessionId: sessionId?.trim() || null,
        wordId: event.word_list_item_id ? null : event.word_id,
        wordListItemId: event.word_list_item_id ?? null,
        action: event.action,
        clientCreatedAt: toClientDate(event.client_created_at),
      })
      .onConflictDoNothing()
      .returning({ id: reviewEvents.id });

    return inserted.length > 0 ? "inserted" : "duplicate";
  } catch (error) {
    if (isReviewTargetForeignKeyViolation(error)) {
      return "skipped";
    }
    throw error;
  }
}

export async function applyNewReviewEvents(args: {
  userId: string;
  deviceId?: string | null;
  sessionId?: string | null;
  events: IncomingReviewEvent[];
}): Promise<string[]> {
  const applied: string[] = [];

  for (const event of args.events) {
    const clientEventId = String(event.client_event_id ?? "").trim();

    // Insert + progress upsert run together in a transaction so a failure
    // between them rolls back the insert. Without the rollback, a retry would
    // hit `onConflictDoNothing` (duplicate) and skip re-applying — leaving the
    // progress row stale forever and causing the visible "marked known but
    // reverted a moment later" bug.
    const result = await db.transaction(async (tx) => {
      const insertResult = await recordReviewEventIfNew(
        {
          userId: args.userId,
          deviceId: args.deviceId,
          sessionId: args.sessionId,
          event,
        },
        tx
      );
      if (insertResult !== "inserted") return insertResult;

      await applyReviewEventToProgress(
        {
          userId: args.userId,
          wordId: event.word_id ?? null,
          wordListItemId: event.word_list_item_id ?? null,
          action: event.action,
          occurredAt: toClientDate(event.client_created_at),
        },
        tx
      );
      return insertResult;
    });

    // "duplicate" means a prior transaction already committed both writes →
    // safe to acknowledge. "skipped" means the event was malformed or its
    // target word no longer exists → ack so the client can drop it.
    if (clientEventId && result !== undefined) applied.push(clientEventId);
  }

  return applied;
}
