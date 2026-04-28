'use client';

import type { ViewMode } from './types';

const ACTIVE_LIST_STORAGE_KEY = 'wordlink-active-list';
const VIEW_MODE_STORAGE_KEY = 'wordlink-view-mode';
const CATEGORY_FILTERS_STORAGE_KEY = 'wordlink-category-filters-by-list';

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
  return 'card';
}

export function persistViewMode(mode: ViewMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, 'card');
}

export function readStoredCategoryFiltersByList(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  const raw = localStorage.getItem(CATEGORY_FILTERS_STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([scopeKey, value]) => [
        scopeKey,
        Array.isArray(value)
          ? value.map((item) => String(item).trim()).filter(Boolean)
          : [],
      ])
    );
  } catch {
    return {};
  }
}

export function persistCategoryFiltersByList(value: Record<string, string[]>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CATEGORY_FILTERS_STORAGE_KEY, JSON.stringify(value));
}
