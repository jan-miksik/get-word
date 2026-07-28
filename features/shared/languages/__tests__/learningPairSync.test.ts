import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueueOp: vi.fn(),
  flushOutboxBeforeRead: vi.fn(),
  syncUserData: vi.fn(),
}));

vi.mock('@/lib/local-first/enqueue', () => ({
  enqueueOp: (...args: unknown[]) => mocks.enqueueOp(...args),
}));
vi.mock('@/lib/local-first/drainer', () => ({
  flushOutboxBeforeRead: () => mocks.flushOutboxBeforeRead(),
}));
vi.mock('@/lib/sync', () => ({
  syncUserData: (...args: unknown[]) => mocks.syncUserData(...args),
}));

import { readPendingLearningLanguagePair } from '../learningPairStorage';
import { queuePendingLearningLanguagePair } from '../learningPairSync';

const pair = {
  from: 'cs',
  to: 'vi',
  changedAt: '2026-07-28T12:00:00.000Z',
};

describe('learningPairSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.flushOutboxBeforeRead.mockResolvedValue(undefined);
  });

  it('durably queues the pair before immediately draining it', async () => {
    mocks.enqueueOp.mockResolvedValue({ clientOpId: 'pair-op' });

    await queuePendingLearningLanguagePair(pair);

    expect(readPendingLearningLanguagePair()).toEqual(pair);
    expect(mocks.enqueueOp).toHaveBeenCalledWith({
      entity: 'preference',
      opType: 'set_language_pair',
      payload: {
        values: {
          language_from: 'cs',
          language_to: 'vi',
          onboarding_completed: true,
        },
      },
      legacyPayload: {
        language_from: 'cs',
        language_to: 'vi',
        onboarding_completed: true,
      },
    });
    expect(mocks.flushOutboxBeforeRead).toHaveBeenCalledOnce();
    expect(mocks.syncUserData).not.toHaveBeenCalled();
  });

  it('uses an immediate direct fallback and clears a confirmed pending pair', async () => {
    mocks.enqueueOp.mockResolvedValue(null);
    mocks.syncUserData.mockResolvedValue({
      user: {
        language_from: 'cs',
        language_to: 'vi',
      },
    });

    await queuePendingLearningLanguagePair(pair);

    expect(mocks.syncUserData).toHaveBeenCalledWith({
      language_from: 'cs',
      language_to: 'vi',
      onboarding_completed: true,
    });
    expect(readPendingLearningLanguagePair()).toBeNull();
  });
});
