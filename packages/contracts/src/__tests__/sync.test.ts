import { describe, expect, it } from 'vitest';
import { SyncOperationResultSchema, SyncRequestSchema } from '../sync';

describe('SyncRequestSchema', () => {
  it('accepts a legacy request without revision metadata', () => {
    const result = SyncRequestSchema.safeParse({
      deviceId: 'device-1',
      show_english: true,
      progress: [{
        word_id: 'legacy-word',
        stage_index: 2,
        known_count: 3,
        unknown_count: 1,
        last_known_at: null,
        last_unknown_at: null,
        next_due_at: null,
      }],
    });

    expect(result.success).toBe(true);
  });

  it('rejects malformed nested mutation data at the transport boundary', () => {
    const result = SyncRequestSchema.safeParse({
      deviceId: 'device-1',
      progress: [{ stage_index: 'two' }],
    });

    expect(result.success).toBe(false);
  });

  it('keeps unknown fields for forward-compatible clients', () => {
    const result = SyncRequestSchema.parse({
      deviceId: 'device-1',
      future_capability: { enabled: true },
    });

    expect(result.future_capability).toEqual({ enabled: true });
  });

  it('validates additive per-operation acknowledgements', () => {
    expect(SyncOperationResultSchema.parse({
      clientOpId: 'op-1',
      status: 'conflict',
      code: 'STALE_REVISION',
    })).toMatchObject({ status: 'conflict', code: 'STALE_REVISION' });
  });

  it('rejects an invalid study-goal timezone', () => {
    const result = SyncRequestSchema.safeParse({
      study_goal: {
        enabled: true,
        goal_days_per_week: 4,
        goal_minutes_per_day: 10,
        goal_preset: 'medium',
        reveal_mode: 'scratch',
        minigame_frequency: 'off',
        timezone: 'Not/A_Real_Zone',
        learning_fine_tune: {},
      },
    });

    expect(result.success).toBe(false);
  });

  it('accepts an eight-hour goal with matching weekdays', () => {
    const result = SyncRequestSchema.safeParse({
      study_goal: {
        enabled: true,
        mode: 'minutes',
        goal_days_per_week: 4,
        goal_weekdays: [1, 3, 5, 6],
        goal_minutes_per_day: 480,
        goal_preset: 'custom',
        reveal_mode: 'scratch',
        minigame_frequency: 'off',
        learning_fine_tune: {},
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects duplicate, mismatched weekdays and more than eight hours', () => {
    const base = {
      enabled: true,
      mode: 'minutes' as const,
      goal_days_per_week: 4,
      goal_preset: 'custom' as const,
      reveal_mode: 'scratch' as const,
      minigame_frequency: 'off' as const,
      learning_fine_tune: {},
    };

    expect(SyncRequestSchema.safeParse({
      study_goal: { ...base, goal_weekdays: [1, 1, 3, 5], goal_minutes_per_day: 10 },
    }).success).toBe(false);
    expect(SyncRequestSchema.safeParse({
      study_goal: { ...base, goal_weekdays: [1, 3, 5], goal_minutes_per_day: 10 },
    }).success).toBe(false);
    expect(SyncRequestSchema.safeParse({
      study_goal: { ...base, goal_weekdays: [1, 3, 5, 6], goal_minutes_per_day: 481 },
    }).success).toBe(false);
  });

  it('rejects an invalid activity-segment timezone', () => {
    const result = SyncRequestSchema.safeParse({
      activity_segments: [{
        client_segment_id: 'segment-1',
        session_id: 'session-1',
        surface: 'study',
        started_at: 1,
        ended_at: 2,
        active_ms: 1,
        timezone_at_creation: 'Not/A_Real_Zone',
      }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a calendar-invalid local day', () => {
    const result = SyncRequestSchema.safeParse({
      review_events: [{
        client_event_id: 'event-1',
        word_list_item_id: 'item-1',
        action: 'known',
        client_created_at: 1,
        local_day_key: '2026-02-30',
      }],
    });

    expect(result.success).toBe(false);
  });
});
