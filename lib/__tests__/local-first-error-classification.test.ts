import { describe, expect, it } from 'vitest';

import { classifySyncFailure } from '../local-first/drainer';
import {
  isRevisionAwareOperation,
  rebaseBlockedPreferenceOperation,
  selectReadyOpsForBatch,
  type OutboxOp,
} from '../local-first/outbox';
import { SyncRequestError } from '../sync';

describe('outbox error classification', () => {
  it.each([
    [new SyncRequestError('busy', 429), 'retryable', 'HTTP_429'],
    [new SyncRequestError('down', 503), 'retryable', 'HTTP_503'],
    [new SyncRequestError('forbidden', 403), 'permanent', 'HTTP_403'],
    [new SyncRequestError('stale revision', 409), 'conflict', 'SYNC_CONFLICT'],
  ] as const)('classifies HTTP failures', (error, kind, reasonCode) => {
    expect(classifySyncFailure(error)).toMatchObject({ kind, reasonCode });
  });

  it('treats network and timeout failures as retryable', () => {
    expect(classifySyncFailure(new Error('Network request timed out'))).toMatchObject({
      kind: 'retryable',
      reasonCode: 'NETWORK_OR_TIMEOUT',
    });
  });

  it('keeps unrecognized failures bounded as unknown', () => {
    expect(classifySyncFailure(new Error('unexpected parser state'))).toMatchObject({
      kind: 'unknown',
      reasonCode: 'UNCLASSIFIED_SYNC_ERROR',
    });
  });
});

describe('outbox conflict recovery', () => {
  it('rebases an explicitly blocked language-pair operation onto the refreshed server revision', () => {
    const blocked = {
      clientOpId: 'pair-1',
      clientCreatedAt: '2026-08-10T00:00:00.000Z',
      deviceId: 'device-1',
      entity: 'preference',
      opType: 'set_language_pair',
      payload: {
        values: {
          language_from: 'cs',
          language_to: 'vi',
          onboarding_completed: true,
          language_pair_base_revision: 3,
        },
        baseRevision: 3,
      },
      attempts: 1,
      status: 'blocked',
      diagnostic: {
        kind: 'conflict',
        reasonCode: 'STALE_REVISION',
        message: 'stale',
        failedAt: '2026-08-10T00:00:01.000Z',
      },
    } satisfies OutboxOp;

    const rebased = rebaseBlockedPreferenceOperation(blocked, {
      settingsLanguageRevision: 8,
      languagePairRevision: 11,
    });

    expect(rebased.status).toBe('pending');
    expect(rebased.attempts).toBe(0);
    expect(rebased.diagnostic).toBeUndefined();
    if (rebased.entity !== 'preference') throw new Error('Expected preference op');
    expect(rebased.payload.baseRevision).toBe(11);
    expect(rebased.payload.values?.language_pair_base_revision).toBe(11);
  });

  it('does not turn an unrelated conflict into a blind retry', () => {
    const blocked = {
      clientOpId: 'filters-1',
      clientCreatedAt: '2026-08-10T00:00:00.000Z',
      deviceId: 'device-1',
      entity: 'category_filters',
      opType: 'replace',
      payload: { filters: ['a'] },
      attempts: 1,
      status: 'blocked',
      diagnostic: {
        kind: 'conflict',
        reasonCode: 'MIXED_REPLAY_REQUIRES_REBASE',
        message: 'mixed',
        failedAt: '2026-08-10T00:00:01.000Z',
      },
    } satisfies OutboxOp;

    expect(rebaseBlockedPreferenceOperation(blocked, {
      settingsLanguageRevision: 8,
      languagePairRevision: 11,
    })).toBe(blocked);
  });
});

describe('outbox retry cohorts', () => {
  function progressOp(id: string, attempts: number, batchId?: string): OutboxOp {
    return {
      clientOpId: id,
      clientCreatedAt: `2026-08-10T00:00:0${id === 'a' ? '1' : '2'}.000Z`,
      deviceId: 'device-1',
      entity: 'progress',
      opType: 'upsert',
      payload: {
        word_id: `word-${id}`,
        stage_index: 1,
        known_count: 1,
        unknown_count: 0,
        last_known_at: null,
        last_unknown_at: null,
        next_due_at: null,
      },
      attempts,
      status: 'retrying',
      batchId,
    };
  }

  it('retries a stable batch id instead of mixing equal attempt counts', () => {
    const first = progressOp('a', 1, 'batch-a');
    const second = progressOp('b', 1, 'batch-b');

    expect(selectReadyOpsForBatch([first, second], 25, Date.now()))
      .toEqual([first]);
  });

  it('isolates revision-aware preferences from unrelated writes', () => {
    const language = {
      clientOpId: 'language',
      clientCreatedAt: '2026-08-10T00:00:01.000Z',
      deviceId: 'device-1',
      entity: 'preference',
      opType: 'set',
      payload: { field: 'settings_language', value: 'cs', baseRevision: 3 },
      attempts: 0,
      status: 'pending',
    } satisfies OutboxOp;
    const progress = progressOp('b', 0);

    expect(isRevisionAwareOperation(language)).toBe(true);
    expect(selectReadyOpsForBatch([language, progress], 25, Date.now()))
      .toEqual([language]);
  });
});
