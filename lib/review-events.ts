import { appendOp } from "@/lib/local-first/outbox";
import { scheduleDrain } from "@/lib/local-first/drainer";
import { isLocalFirstAvailableSync, ensureLocalFirstAvailability } from "@/lib/local-first/availability";
import { getDeviceId } from "@/lib/device-id";
import { createBrowserId } from "@/lib/browser-id";
import { localDayKeyAt } from '@/lib/local-day';
import {
  appendPendingReviewEvent,
  clearAppliedReviewEvents,
  getPendingReviewEvents,
} from "@/features/sync/review-event-outbox";
import type {
  SyncReviewEventAction,
  SyncReviewEventItem,
} from "@/features/sync/types";

export { clearAppliedReviewEvents, getPendingReviewEvents };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createReviewEvent(
  wordId: string,
  action: SyncReviewEventAction,
  now = Date.now()
): SyncReviewEventItem {
  const isItemId = UUID_RE.test(wordId);
  return {
    client_event_id: createBrowserId("review"),
    ...(isItemId ? { word_list_item_id: wordId } : { word_id: wordId }),
    action,
    client_created_at: now,
    local_day_key: localDayKeyAt(now),
  };
}

export function getReviewEventTargetId(event: SyncReviewEventItem): string | null {
  return event.word_list_item_id ?? event.word_id ?? null;
}

export function enqueueReviewEvent(event: SyncReviewEventItem): SyncReviewEventItem[] {
  const events = appendPendingReviewEvent(event);
  void writeThroughToIdbOutbox(event);
  return events;
}

async function writeThroughToIdbOutbox(event: SyncReviewEventItem): Promise<void> {
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
