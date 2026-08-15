import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  claim: vi.fn(),
  delete: vi.fn(),
  markFailed: vi.fn(),
  release: vi.fn(),
  checkpoint: vi.fn(),
  sync: vi.fn(),
  publish: vi.fn(),
}));

vi.mock('../local-first/availability', () => ({
  ensureLocalFirstAvailability: mocks.ensure,
}));

vi.mock('../local-first/outbox', async (importOriginal) => ({
  ...await importOriginal<typeof import('../local-first/outbox')>(),
  claimReadyBatch: mocks.claim,
  deleteOps: mocks.delete,
  markFailed: mocks.markFailed,
  releaseOpsToPending: mocks.release,
}));

vi.mock('../local-first/hydrate', () => ({
  checkpointAcknowledgedOps: mocks.checkpoint,
}));

vi.mock('../sync', async (importOriginal) => ({
  ...await importOriginal<typeof import('../sync')>(),
  syncUserData: mocks.sync,
  publishSyncResponse: mocks.publish,
}));

import { flushOutboxBeforeRead } from '../local-first/drainer';
import type { OutboxOp } from '../local-first/outbox';
import { SyncRequestError } from '../sync';

const progressOp = {
  clientOpId: 'progress-1',
  batchId: 'batch-1',
  clientCreatedAt: '2026-08-10T00:00:00.000Z',
  deviceId: 'device-1',
  attempts: 0,
  status: 'pending',
  entity: 'progress',
  opType: 'upsert',
  payload: {
    word_id: 'word-1',
    stage_index: 2,
    known_count: 1,
    unknown_count: 0,
    last_known_at: null,
    last_unknown_at: null,
    next_due_at: null,
  },
} satisfies OutboxOp;

const segmentOp = {
  clientOpId: 'segment-1',
  batchId: 'batch-1',
  clientCreatedAt: '2026-08-10T00:00:02.000Z',
  deviceId: 'device-1',
  attempts: 0,
  status: 'pending',
  entity: 'activity_segment',
  opType: 'event',
  payload: {
    owner: null,
    client_segment_id: 'segment-1',
    session_id: 'session-1',
    surface: 'study',
    started_at: 1_760_000_000_000,
    ended_at: 1_760_000_060_000,
    active_ms: 60_000,
  },
} satisfies OutboxOp;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensure.mockResolvedValue(true);
  mocks.delete.mockResolvedValue(undefined);
  mocks.markFailed.mockResolvedValue(undefined);
  mocks.release.mockResolvedValue(undefined);
});

describe('local-first drainer acknowledgements', () => {
  it('checkpoints acknowledged state before deleting the durable operation', async () => {
    const acknowledgement = {
      success: true,
      is_delta: true,
      user: { id: 'user-1' },
      applied_client_op_ids: ['progress-1'],
      op_results: [{ clientOpId: 'progress-1', status: 'applied' }],
    };
    const reconciled = { ...acknowledgement, progress: {}, memory_hooks: {}, category_filters: [] };
    mocks.claim.mockResolvedValue([progressOp]);
    mocks.sync.mockResolvedValue(acknowledgement);
    mocks.checkpoint.mockResolvedValue(reconciled);

    await flushOutboxBeforeRead();

    expect(mocks.sync).toHaveBeenCalledWith(expect.any(Object), { emitEvent: false });
    expect(mocks.checkpoint).toHaveBeenCalledWith(acknowledgement, [progressOp]);
    expect(mocks.checkpoint.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.delete.mock.invocationCallOrder[0]);
    expect(mocks.delete).toHaveBeenCalledWith(['progress-1']);
    expect(mocks.publish).toHaveBeenCalledWith(reconciled, undefined);
  });

  it('blocks only revision-aware operations after an aggregate 409', async () => {
    const languageOp = {
      clientOpId: 'language-1',
      batchId: 'legacy-mixed-batch',
      clientCreatedAt: '2026-08-10T00:00:01.000Z',
      deviceId: 'device-1',
      attempts: 0,
      status: 'pending',
      entity: 'preference',
      opType: 'set',
      payload: { field: 'settings_language', value: 'cs', baseRevision: 2 },
    } satisfies OutboxOp;
    mocks.claim.mockResolvedValue([languageOp, progressOp]);
    mocks.sync.mockRejectedValue(new SyncRequestError('Stale revision', 409, {
      op_results: [
        { clientOpId: 'language-1', status: 'conflict', code: 'STALE_REVISION' },
        { clientOpId: 'progress-1', status: 'conflict', code: 'STALE_REVISION' },
      ],
    }));

    await flushOutboxBeforeRead();

    expect(mocks.markFailed).toHaveBeenCalledWith(['language-1'], expect.objectContaining({
      kind: 'conflict',
      reasonCode: 'STALE_REVISION',
    }));
    expect(mocks.release).toHaveBeenCalledWith(['progress-1']);
    expect(mocks.markFailed).not.toHaveBeenCalledWith(
      ['progress-1'],
      expect.objectContaining({ kind: 'conflict' }),
    );
  });
  it('keeps an operation the server deferred, and everything else in its batch', async () => {
    // The server stores measurement separately from the rest of the batch, so a
    // failed segment write comes back beside acknowledged progress.
    mocks.claim.mockResolvedValue([progressOp, segmentOp]);
    const acknowledgement = {
      success: true,
      is_delta: true,
      user: { id: 'user-1' },
      applied_client_op_ids: ['progress-1'],
      op_results: [
        { clientOpId: 'progress-1', status: 'applied' },
        { clientOpId: 'segment-1', status: 'retry' },
      ],
    };
    mocks.sync.mockResolvedValue(acknowledgement);
    mocks.checkpoint.mockResolvedValue(acknowledgement);

    await flushOutboxBeforeRead();

    expect(mocks.delete).toHaveBeenCalledWith(['progress-1']);
    // Retryable, not blocked: nothing about it needs the user's attention.
    expect(mocks.markFailed).toHaveBeenCalledWith(['segment-1'], expect.objectContaining({
      kind: 'retryable',
      reasonCode: 'SERVER_DEFERRED',
    }));
  });

  it('does not read an all-deferred response as a legacy accept-everything', async () => {
    // The compatibility path for servers that predate op_results deletes the
    // whole batch. A server that answered and acknowledged nothing means the
    // opposite, and an activity-only batch is exactly that shape.
    mocks.claim.mockResolvedValue([segmentOp]);
    const acknowledgement = {
      success: true,
      is_delta: true,
      user: { id: 'user-1' },
      applied_client_op_ids: [],
      op_results: [{ clientOpId: 'segment-1', status: 'retry' }],
    };
    mocks.sync.mockResolvedValue(acknowledgement);
    // Reconciles fine — so nothing but the acknowledgement itself decides
    // whether the operation may be forgotten.
    mocks.checkpoint.mockResolvedValue(acknowledgement);

    await flushOutboxBeforeRead();

    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledWith(['segment-1'], expect.objectContaining({
      kind: 'retryable',
      reasonCode: 'SERVER_DEFERRED',
    }));
  });

  it('treats a present empty op_results array as the current acknowledgement protocol', async () => {
    mocks.claim.mockResolvedValue([segmentOp]);
    const acknowledgement = {
      success: true,
      is_delta: true,
      user: { id: 'user-1' },
      applied_client_op_ids: [],
      op_results: [],
    };
    mocks.sync.mockResolvedValue(acknowledgement);

    await flushOutboxBeforeRead();

    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledWith(['segment-1'], expect.objectContaining({
      kind: 'unknown',
      reasonCode: 'SYNC_NOT_ACKNOWLEDGED',
    }));
  });
});
