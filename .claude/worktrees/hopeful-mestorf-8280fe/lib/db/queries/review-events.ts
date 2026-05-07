import { db } from "../client";
import { reviewEvents } from "../schema";
import { applyReviewEventToProgress, type ReviewProgressAction } from "./progress";

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

export async function recordReviewEventIfNew(args: {
  userId: string;
  deviceId?: string | null;
  sessionId?: string | null;
  event: IncomingReviewEvent;
}): Promise<boolean> {
  const { userId, deviceId, sessionId, event } = args;
  const clientEventId = String(event.client_event_id ?? "").trim();
  if (!clientEventId) return false;
  if (!event.word_id && !event.word_list_item_id) return false;

  const inserted = await db
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

  return inserted.length > 0;
}

export async function applyNewReviewEvents(args: {
  userId: string;
  deviceId?: string | null;
  sessionId?: string | null;
  events: IncomingReviewEvent[];
}): Promise<string[]> {
  const applied: string[] = [];

  for (const event of args.events) {
    const inserted = await recordReviewEventIfNew({
      userId: args.userId,
      deviceId: args.deviceId,
      sessionId: args.sessionId,
      event,
    });
    if (!inserted) continue;

    await applyReviewEventToProgress({
      userId: args.userId,
      wordId: event.word_id ?? null,
      wordListItemId: event.word_list_item_id ?? null,
      action: event.action,
      occurredAt: toClientDate(event.client_created_at),
    });
    applied.push(event.client_event_id);
  }

  return applied;
}
