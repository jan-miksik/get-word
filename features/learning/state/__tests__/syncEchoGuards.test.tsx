import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDebouncedSync = vi.fn<(data: unknown) => Promise<void>>(() => Promise.resolve());
const mockPostTabMessage = vi.fn<(message: unknown) => void>();
const mockSubscribeTabMessages = vi.fn<(listener: unknown) => () => void>(() => () => {});

vi.mock('@/lib/sync', () => ({
  debouncedSync: (data: unknown) => mockDebouncedSync(data),
}));

vi.mock('@/lib/tab-sync', () => ({
  postTabMessage: (message: unknown) => mockPostTabMessage(message),
  subscribeTabMessages: (listener: unknown) => mockSubscribeTabMessages(listener),
}));

import { useCategoryFilter } from '../categoryFilter';
import { usePreferences } from '../preferences';
import type { SyncResponse } from '@/lib/sync';
import type { NormalizedWord } from '@/lib/words';

const baseUser = {
  id: 'user-1',
  role: 'vi',
  show_english: true,
  show_category_badges: false,
  show_pronunciation: false,
  memory_hooks_enabled: true,
  memory_hook_disable_from_stage: 8,
  category_order: ['animals', 'travel'],
} as SyncResponse['user'];

const words = [
  {
    id: 'word-1',
    category: ['animals', 'word'],
    cz: 'pes',
    en: 'dog',
    vi: 'cho',
  },
  {
    id: 'word-2',
    category: ['travel', 'word'],
    cz: 'letiste',
    en: 'airport',
    vi: 'san bay',
  },
] as NormalizedWord[];

describe('server sync echo guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSubscribeTabMessages.mockReturnValue(() => {});
    mockDebouncedSync.mockResolvedValue(undefined);
  });

  it('does not re-sync unchanged server category order payloads', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result, rerender } = renderHook(
      ({ isHydrated }) => usePreferences(isHydrated, isUpdatingFromServerRef),
      { initialProps: { isHydrated: false } }
    );

    act(() => {
      result.current.applyServerPreferences(baseUser);
    });

    rerender({ isHydrated: true });
    mockDebouncedSync.mockClear();

    act(() => {
      result.current.applyServerPreferences({ ...baseUser, category_order: ['animals', 'travel'] });
    });

    rerender({ isHydrated: true });

    expect(mockDebouncedSync).not.toHaveBeenCalled();
  });

  it('does not re-sync unchanged server category filters', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result, rerender } = renderHook(
      ({ isHydrated, scopeKey }) =>
        useCategoryFilter(words, isHydrated, isUpdatingFromServerRef, scopeKey),
      { initialProps: { isHydrated: false, scopeKey: 'list-a' } }
    );

    act(() => {
      result.current.applyServerCategories(['animals']);
    });

    rerender({ isHydrated: true, scopeKey: 'list-a' });
    mockDebouncedSync.mockClear();

    act(() => {
      result.current.applyServerCategories(['animals']);
    });

    rerender({ isHydrated: true, scopeKey: 'list-a' });

    expect(mockDebouncedSync).not.toHaveBeenCalled();
  });

  it('defaults a new list scope to all of its categories', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() =>
      useCategoryFilter(words, true, isUpdatingFromServerRef, 'list-a')
    );

    expect(Array.from(result.current.selectedCategories).sort()).toEqual(['animals', 'travel']);
    expect(result.current.filteredWords).toHaveLength(2);
  });

  it('keeps category visibility scoped per list', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result, rerender } = renderHook(
      ({ scopeKey, hookWords }) => useCategoryFilter(hookWords, true, isUpdatingFromServerRef, scopeKey),
      {
        initialProps: {
          scopeKey: 'list-a',
          hookWords: words,
        },
      }
    );

    act(() => {
      result.current.toggleCategory('travel');
    });

    expect(Array.from(result.current.selectedCategories)).toEqual(['animals']);
    expect(result.current.filteredWords.map((word) => word.id)).toEqual(['word-1']);

    const listBWords = [
      {
        id: 'word-3',
        category: ['Basic', 'word'],
        cz: 'ahoj',
        en: 'hello',
        vi: 'xin chao',
      },
    ] as NormalizedWord[];

    rerender({
      scopeKey: 'list-b',
      hookWords: listBWords,
    });

    expect(Array.from(result.current.selectedCategories)).toEqual(['Basic']);
    expect(result.current.filteredWords.map((word) => word.id)).toEqual(['word-3']);

    rerender({
      scopeKey: 'list-a',
      hookWords: words,
    });

    expect(Array.from(result.current.selectedCategories)).toEqual(['animals']);
    expect(result.current.filteredWords.map((word) => word.id)).toEqual(['word-1']);
  });
});
