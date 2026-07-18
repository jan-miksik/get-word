'use client';

import type { SyncReviewEventItem } from './types';

const REVIEW_EVENT_OUTBOX_KEY = 'get_word_review_event_outbox';

function readReviewEventOutbox(): SyncReviewEventItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(REVIEW_EVENT_OUTBOX_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeReviewEventOutbox(events: SyncReviewEventItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(REVIEW_EVENT_OUTBOX_KEY, JSON.stringify(events));
  } catch {
    // The optimistic in-memory state still works when storage is unavailable.
  }
}

export function getPendingReviewEvents(): SyncReviewEventItem[] {
  return readReviewEventOutbox();
}

export function appendPendingReviewEvent(event: SyncReviewEventItem): SyncReviewEventItem[] {
  const events = readReviewEventOutbox();
  if (!events.some((candidate) => candidate.client_event_id === event.client_event_id)) {
    events.push(event);
    writeReviewEventOutbox(events);
  }
  return events;
}

export function clearAppliedReviewEvents(clientEventIds: string[] | undefined): void {
  if (!clientEventIds || clientEventIds.length === 0) return;
  const applied = new Set(clientEventIds);
  writeReviewEventOutbox(
    readReviewEventOutbox().filter((event) => !applied.has(event.client_event_id)),
  );
}
