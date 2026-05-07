import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInsert = vi.fn();
const mockApplyReviewEventToProgress = vi.fn();

vi.mock('@/lib/db/client', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock('../progress', () => ({
  applyReviewEventToProgress: (...args: unknown[]) => mockApplyReviewEventToProgress(...args),
}));

import { applyNewReviewEvents } from '../review-events';

function mockInsertReturning(returningValue: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returningValue);
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  mockInsert.mockReturnValue({ values });
  return { values, onConflictDoNothing, returning };
}

describe('applyNewReviewEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies newly inserted review events', async () => {
    mockInsertReturning([{ id: 'row-1' }]);

    const applied = await applyNewReviewEvents({
      userId: 'user-1',
      deviceId: 'device-1',
      sessionId: 'session-1',
      events: [{
        client_event_id: 'event-1',
        word_id: 'w001',
        action: 'known',
        client_created_at: 1776944510000,
      }],
    });

    expect(applied).toEqual(['event-1']);
    expect(mockApplyReviewEventToProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        wordId: 'w001',
        action: 'known',
      })
    );
  });

  it('does not apply duplicate events when insert is ignored', async () => {
    mockInsertReturning([]);

    const applied = await applyNewReviewEvents({
      userId: 'user-1',
      events: [{
        client_event_id: 'event-1',
        word_id: 'w001',
        action: 'known',
        client_created_at: 1776944510000,
      }],
    });

    expect(applied).toEqual([]);
    expect(mockApplyReviewEventToProgress).not.toHaveBeenCalled();
  });
});
