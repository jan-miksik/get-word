import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnqueueOp = vi.fn<(input: unknown) => Promise<null>>(() => Promise.resolve(null));
const mockPostTabMessage = vi.fn<(message: unknown) => void>();
const mockSubscribeTabMessages = vi.fn<(listener: unknown) => () => void>(() => () => {});

vi.mock('@/lib/local-first/enqueue', () => ({
  enqueueOp: (input: unknown) => mockEnqueueOp(input),
}));

vi.mock('@/lib/tab-sync', () => ({
  postTabMessage: (message: unknown) => mockPostTabMessage(message),
  subscribeTabMessages: (listener: unknown) => mockSubscribeTabMessages(listener),
}));

import { useMemoryHooks } from '../memoryHooks';

describe('useMemoryHooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueOp.mockResolvedValue(null);
    mockSubscribeTabMessages.mockReturnValue(() => {});
  });

  it('reads hooks through a canonical item alias', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() =>
      useMemoryHooks(true, isUpdatingFromServerRef, 'vi')
    );

    act(() => {
      result.current.applyServerMemoryHooks({
        'source-item-id': 'remember this',
      });
    });

    expect(
      result.current.getMemoryHook({
        id: 'copied-item-id',
        canonicalWordId: 'source-item-id',
      })
    ).toBe('remember this');
  });

  it('syncs new hooks using the canonical item alias when present', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() =>
      useMemoryHooks(true, isUpdatingFromServerRef, 'vi')
    );

    act(() => {
      result.current.setMemoryHook(
        {
          id: 'copied-item-id',
          canonicalWordId: 'source-item-id',
        },
        '  hook text  '
      );
    });

    expect(
      result.current.getMemoryHook({
        id: 'copied-item-id',
        canonicalWordId: 'source-item-id',
      })
    ).toBe('hook text');
    expect(mockEnqueueOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'memory_hook',
        opType: 'set',
        payload: { id: 'source-item-id', text: 'hook text' },
        legacyPayload: { memory_hooks: { 'source-item-id': 'hook text' } },
      })
    );
    expect(mockPostTabMessage).toHaveBeenCalledWith({
      type: 'memory_hook_changed',
      wordId: 'source-item-id',
      hook: 'hook text',
    });
  });
});
