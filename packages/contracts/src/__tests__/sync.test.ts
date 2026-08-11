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
});
