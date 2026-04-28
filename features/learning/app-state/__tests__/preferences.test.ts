import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useActiveListState } from '../useActiveListState';
import { useViewModePreference } from '../useViewModePreference';
import {
  persistCategoryFiltersByList,
  readStoredCategoryFiltersByList,
} from '../storage';

describe('learning app-state preferences', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, String(value));
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
      },
    });
  });

  beforeEach(() => {
    localStorage.removeItem('wordlink-active-list');
    localStorage.removeItem('wordlink-view-mode');
    localStorage.removeItem('wordlink-category-filters-by-list');
  });

  it('hydrates active list from localStorage and persists updates', () => {
    localStorage.setItem('wordlink-active-list', 'list-123');

    const { result } = renderHook(() => useActiveListState());
    expect(result.current.activeListId).toBe('list-123');

    act(() => {
      result.current.setActiveListId('list-456');
    });

    expect(result.current.activeListId).toBe('list-456');
    expect(localStorage.getItem('wordlink-active-list')).toBe('list-456');
  });

  it('removes stored active list when cleared', () => {
    localStorage.setItem('wordlink-active-list', 'list-123');

    const { result } = renderHook(() => useActiveListState());

    act(() => {
      result.current.setActiveListId(null);
    });

    expect(result.current.activeListId).toBeNull();
    expect(localStorage.getItem('wordlink-active-list')).toBeNull();
  });

  it('keeps view mode pinned to card and persists card mode', () => {
    localStorage.setItem('wordlink-view-mode', 'stream');

    const { result } = renderHook(() => useViewModePreference());
    expect(result.current.viewMode).toBe('card');

    act(() => {
      result.current.setViewMode('stream');
    });

    expect(result.current.viewMode).toBe('card');
    expect(localStorage.getItem('wordlink-view-mode')).toBe('card');
  });

  it('persists category filters by list in localStorage', () => {
    persistCategoryFiltersByList({
      'list-1': ['Basic', 'Travel'],
      'list-2': ['Food'],
    });

    expect(readStoredCategoryFiltersByList()).toEqual({
      'list-1': ['Basic', 'Travel'],
      'list-2': ['Food'],
    });
  });
});
