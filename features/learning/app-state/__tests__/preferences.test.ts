import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useActiveListState } from '../useActiveListState';
import { useViewModePreference } from '../useViewModePreference';
import {
  persistCategoryFiltersByList,
  persistLearningRoleForPair,
  readStoredCategoryFiltersByList,
  readStoredLearningRoleForPair,
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
    localStorage.removeItem('get-word-active-list');
    localStorage.removeItem('get-word-view-mode');
    localStorage.removeItem('get-word-category-filters-by-list');
    localStorage.removeItem('get-word-learning-role-by-pair');
  });

  it('hydrates active list from localStorage and persists updates', () => {
    localStorage.setItem('get-word-active-list', 'list-123');

    const { result } = renderHook(() => useActiveListState());
    expect(result.current.activeListId).toBe('list-123');

    act(() => {
      result.current.setActiveListId('list-456');
    });

    expect(result.current.activeListId).toBe('list-456');
    expect(localStorage.getItem('get-word-active-list')).toBe('list-456');
  });

  it('removes stored active list when cleared', () => {
    localStorage.setItem('get-word-active-list', 'list-123');

    const { result } = renderHook(() => useActiveListState());

    act(() => {
      result.current.setActiveListId(null);
    });

    expect(result.current.activeListId).toBeNull();
    expect(localStorage.getItem('get-word-active-list')).toBeNull();
  });

  it('keeps view mode pinned to card and persists card mode', () => {
    localStorage.setItem('get-word-view-mode', 'stream');

    const { result } = renderHook(() => useViewModePreference());
    expect(result.current.viewMode).toBe('card');

    act(() => {
      result.current.setViewMode('stream');
    });

    expect(result.current.viewMode).toBe('card');
    expect(localStorage.getItem('get-word-view-mode')).toBe('card');
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

  it('persists the selected learning side for an exact language pair', () => {
    persistLearningRoleForPair('en', 'fr', 'knownLanguage');
    persistLearningRoleForPair('fr', 'en', 'languageToLearn');

    expect(readStoredLearningRoleForPair('en', 'fr')).toBe('knownLanguage');
    expect(readStoredLearningRoleForPair('fr', 'en')).toBe('languageToLearn');
    expect(readStoredLearningRoleForPair('en', 'de')).toBeNull();
  });

  it('drops entries with unknown role values on read', () => {
    localStorage.setItem(
      'get-word-learning-role-by-pair',
      JSON.stringify({
        'en__fr': 'knownLanguage',
        'es__pt': 'unknown-value',
        'de__it': 'cz',
      }),
    );

    expect(readStoredLearningRoleForPair('en', 'fr')).toBe('knownLanguage');
    expect(readStoredLearningRoleForPair('es', 'pt')).toBeNull();
    expect(readStoredLearningRoleForPair('de', 'it')).toBeNull();
  });
});
