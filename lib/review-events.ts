import { appendOp } from "@/lib/local-first/outbox";
import { scheduleDrain } from "@/lib/local-first/drainer";
import { isLocalFirstAvailableSync, ensureLocalFirstAvailability } from "@/lib/local-first/availability";
import { getDeviceId } from "@/lib/device-id";
import { createBrowserId } from "@/lib/browser-id";

const REVIEW_EVENT_OUTBOX_KEY = "get_word_review_event_outbox";

export type ReviewEventAction = "known" | "really_known" | "unknown";

export interface ReviewEventPayload {
  client_event_id: string;
  word_id?: string;
  word_list_item_id?: string;
  action: ReviewEventAction;
  client_created_at: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createReviewEvent(
  wordId: string,
  action: ReviewEventAction,
  now = Date.now()
): ReviewEventPayload {
  const isItemId = UUID_RE.test(wordId);
  return {
    client_event_id: createBrowserId("review"),
    ...(isItemId ? { word_list_item_id: wordId } : { word_id: wordId }),
    action,
    client_created_at: now,
  };
}

export function getReviewEventTargetId(event: ReviewEventPayload): string | null {
  return event.word_list_item_id ?? event.word_id ?? null;
}

function readOutbox(): ReviewEventPayload[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(REVIEW_EVENT_OUTBOX_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutbox(events: ReviewEventPayload[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REVIEW_EVENT_OUTBOX_KEY, JSON.stringify(events));
  } catch {
    // If storage is full/unavailable, the optimistic in-memory state still works.
  }
}

export function getPendingReviewEvents(): ReviewEventPayload[] {
  return readOutbox();
}

export function enqueueReviewEvent(event: ReviewEventPayload): ReviewEventPayload[] {
  const events = readOutbox();
  if (!events.some((e) => e.client_event_id === event.client_event_id)) {
    events.push(event);
    writeOutbox(events);
  }
  void writeThroughToIdbOutbox(event);
  return events;
}

async function writeThroughToIdbOutbox(event: ReviewEventPayload): Promise<void> {
  try {
    const available = isLocalFirstAvailableSync()
      ? true
      : await ensureLocalFirstAvailability();
    if (!available) return;
    await appendOp({
      entity: "review_event",
      opType: "event",
      payload: event,
      clientOpId: event.client_event_id,
      deviceId: safeDeviceId(),
    });
    scheduleDrain();
  } catch (error) {
    console.error("[review-events] failed to write-through to IDB outbox:", error);
  }
}

function safeDeviceId(): string | null {
  try {
    const id = getDeviceId();
    return id || null;
  } catch {
    return null;
  }
}

export function clearAppliedReviewEvents(clientEventIds: string[] | undefined): void {
  if (!clientEventIds || clientEventIds.length === 0) return;
  const applied = new Set(clientEventIds);
  writeOutbox(readOutbox().filter((event) => !applied.has(event.client_event_id)));
}
