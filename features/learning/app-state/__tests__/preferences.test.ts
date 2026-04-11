import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useActiveListState } from '../useActiveListState';
import { useViewModePreference } from '../useViewModePreference';

describe('learning app-state preferences', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('hydrates view mode from localStorage and persists updates', () => {
    localStorage.setItem('wordlink-view-mode', 'stream');

    const { result } = renderHook(() => useViewModePreference());
    expect(result.current.viewMode).toBe('stream');

    act(() => {
      result.current.setViewMode('card');
    });

    expect(result.current.viewMode).toBe('card');
    expect(localStorage.getItem('wordlink-view-mode')).toBe('card');
  });
});
