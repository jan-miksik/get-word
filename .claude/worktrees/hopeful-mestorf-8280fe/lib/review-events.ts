const REVIEW_EVENT_OUTBOX_KEY = "wordlink_review_event_outbox";

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
    client_event_id: crypto.randomUUID(),
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
  return events;
}

export function clearAppliedReviewEvents(clientEventIds: string[] | undefined): void {
  if (!clientEventIds || clientEventIds.length === 0) return;
  const applied = new Set(clientEventIds);
  writeOutbox(readOutbox().filter((event) => !applied.has(event.client_event_id)));
}
