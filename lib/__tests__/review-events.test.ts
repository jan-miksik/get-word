import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAppliedReviewEvents,
  createReviewEvent,
  enqueueReviewEvent,
  getPendingReviewEvents,
} from '../review-events';

describe('review event outbox', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('event-1' as `${string}-${string}-${string}-${string}-${string}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates item-id events for UUID targets', () => {
    const event = createReviewEvent(
      '123e4567-e89b-12d3-a456-426614174000',
      'known',
      1776944510000
    );

    expect(event).toEqual({
      client_event_id: 'event-1',
      word_list_item_id: '123e4567-e89b-12d3-a456-426614174000',
      action: 'known',
      client_created_at: 1776944510000,
      local_day_key: expect.any(String),
    });
  });

  it('dedupes queued events and clears applied ids', () => {
    const event = createReviewEvent('w001', 'unknown', 1776944510000);

    enqueueReviewEvent(event);
    enqueueReviewEvent(event);
    expect(getPendingReviewEvents()).toHaveLength(1);

    clearAppliedReviewEvents(['event-1']);
    expect(getPendingReviewEvents()).toEqual([]);
  });
});
