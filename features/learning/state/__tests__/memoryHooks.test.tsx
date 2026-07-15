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

import { MEMORY_HOOK_MAX_LENGTH, useMemoryHooks } from '../memoryHooks';

describe('useMemoryHooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueOp.mockResolvedValue(null);
    mockSubscribeTabMessages.mockReturnValue(() => {});
  });

  it('reads hooks through a canonical item alias', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() =>
      useMemoryHooks(true, isUpdatingFromServerRef, 'languageToLearn')
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
      useMemoryHooks(true, isUpdatingFromServerRef, 'languageToLearn')
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
    expect(mockPostTabMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'memory_hook_changed',
        wordId: 'source-item-id',
        hook: 'hook text',
        updatedAt: expect.any(Number),
      })
    );
  });

  it('limits saved hooks before updating local and synced state', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() =>
      useMemoryHooks(true, isUpdatingFromServerRef, 'languageToLearn')
    );
    const longHook = 'a'.repeat(MEMORY_HOOK_MAX_LENGTH + 40);

    act(() => {
      result.current.setMemoryHook('w001', longHook);
    });

    const limitedHook = 'a'.repeat(MEMORY_HOOK_MAX_LENGTH);
    expect(result.current.getMemoryHook('w001')).toBe(limitedHook);
    expect(mockEnqueueOp).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { id: 'w001', text: limitedHook },
      })
    );
  });

  it('ignores tab broadcasts older than the last local write', () => {
    let inboundListener: ((message: unknown) => void) | null = null;
    mockSubscribeTabMessages.mockImplementation((listener) => {
      inboundListener = listener as (message: unknown) => void;
      return () => {};
    });

    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() =>
      useMemoryHooks(true, isUpdatingFromServerRef, 'languageToLearn')
    );

    act(() => {
      result.current.setMemoryHook('w001', 'fresh local');
    });
    const fresh = mockPostTabMessage.mock.calls.at(-1)![0] as { updatedAt: number };

    // A stale broadcast (timestamped a second before the local write) must
    // not overwrite the user's just-typed edit.
    act(() => {
      inboundListener?.({
        type: 'memory_hook_changed',
        wordId: 'w001',
        hook: 'stale remote',
        updatedAt: fresh.updatedAt - 1000,
        sessionId: 'other-tab',
      });
    });

    expect(result.current.getMemoryHook('w001')).toBe('fresh local');

    // A newer broadcast does win, however.
    act(() => {
      inboundListener?.({
        type: 'memory_hook_changed',
        wordId: 'w001',
        hook: 'newer remote',
        updatedAt: fresh.updatedAt + 1000,
        sessionId: 'other-tab',
      });
    });

    expect(result.current.getMemoryHook('w001')).toBe('newer remote');
  });

  it('shadows server snapshots with in-flight local writes', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() =>
      useMemoryHooks(true, isUpdatingFromServerRef, 'languageToLearn')
    );

    act(() => {
      result.current.setMemoryHook('w001', 'just typed');
    });

    // Snapshot still reflects the prior server value because our POST is
    // mid-flight. Without the pending shadow the UI would revert to "old".
    act(() => {
      result.current.applyServerMemoryHooks({ w001: 'old', w002: 'unrelated' });
    });

    expect(result.current.getMemoryHook('w001')).toBe('just typed');
    expect(result.current.getMemoryHook('w002')).toBe('unrelated');
  });

  it('drops the pending shadow once the server reflects the local value', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() =>
      useMemoryHooks(true, isUpdatingFromServerRef, 'languageToLearn')
    );

    act(() => {
      result.current.setMemoryHook('w001', 'landed');
    });
    // First snapshot still has the old value — shadow applies.
    act(() => {
      result.current.applyServerMemoryHooks({ w001: 'old' });
    });
    expect(result.current.getMemoryHook('w001')).toBe('landed');

    // Second snapshot now matches — pending shadow drops, future server
    // changes (e.g. from another device) will be visible.
    act(() => {
      result.current.applyServerMemoryHooks({ w001: 'landed' });
    });
    act(() => {
      result.current.applyServerMemoryHooks({ w001: 'overwritten from device B' });
    });
    expect(result.current.getMemoryHook('w001')).toBe('overwritten from device B');
  });

  it('shadows delta merges with pending local writes', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() =>
      useMemoryHooks(true, isUpdatingFromServerRef, 'languageToLearn')
    );

    act(() => {
      result.current.setMemoryHook('w001', 'local pending');
    });
    // A delta saying "w001 = old" mid-flight must not revert the optimistic write.
    act(() => {
      result.current.mergeServerMemoryHooks({ w001: 'old' });
    });
    expect(result.current.getMemoryHook('w001')).toBe('local pending');
  });

  it('shadows delete tombstones for in-flight local writes', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() =>
      useMemoryHooks(true, isUpdatingFromServerRef, 'languageToLearn')
    );

    act(() => {
      result.current.setMemoryHook('w001', 're-created');
    });
    // Delta carries a tombstone for w001 (another device's stale delete).
    act(() => {
      result.current.mergeServerMemoryHooks({}, ['w001']);
    });
    // Our local write must win.
    expect(result.current.getMemoryHook('w001')).toBe('re-created');
  });
});
