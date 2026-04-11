'use client';

import type { ViewMode } from './types';

const ACTIVE_LIST_STORAGE_KEY = 'wordlink-active-list';
const VIEW_MODE_STORAGE_KEY = 'wordlink-view-mode';

export function readStoredActiveListId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_LIST_STORAGE_KEY) ?? null;
}

export function persistActiveListId(id: string | null): void {
  if (typeof window === 'undefined') return;
  if (id) {
    localStorage.setItem(ACTIVE_LIST_STORAGE_KEY, id);
    return;
  }
  localStorage.removeItem(ACTIVE_LIST_STORAGE_KEY);
}

export function readStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'card';
  return (localStorage.getItem(VIEW_MODE_STORAGE_KEY) as ViewMode) ?? 'card';
}

export function persistViewMode(mode: ViewMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
}
