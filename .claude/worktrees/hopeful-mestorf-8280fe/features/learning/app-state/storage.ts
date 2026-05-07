'use client';

import type { ViewMode } from './types';

const ACTIVE_LIST_STORAGE_KEY = 'wordlink-active-list';
const VIEW_MODE_STORAGE_KEY = 'wordlink-view-mode';
const CATEGORY_FILTERS_STORAGE_KEY = 'wordlink-category-filters-by-list';
const LEARNING_ROLE_BY_PAIR_STORAGE_KEY = 'wordlink-learning-role-by-pair';

type StoredLearningRole = 'cz' | 'vi';

function normalizePairCode(code: string): string {
  const trimmed = String(code).trim();
  if (!trimmed) return '';
  const [base, region] = trimmed.split('-');
  if (!region) return base.toLowerCase();
  return `${base.toLowerCase()}-${region.toUpperCase()}`;
}

function getLearningPairKey(languageFrom: string, languageTo: string): string {
  return `${normalizePairCode(languageFrom)}__${normalizePairCode(languageTo)}`;
}

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

export function readStoredLearningRolesByPair(): Record<string, StoredLearningRole> {
  if (typeof window === 'undefined') return {};
  const raw = localStorage.getItem(LEARNING_ROLE_BY_PAIR_STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, StoredLearningRole] => (
        entry[1] === 'cz' || entry[1] === 'vi'
      )),
    );
  } catch {
    return {};
  }
}

export function readStoredLearningRoleForPair(
  languageFrom: string,
  languageTo: string,
): StoredLearningRole | null {
  const roles = readStoredLearningRolesByPair();
  return roles[getLearningPairKey(languageFrom, languageTo)] ?? null;
}

export function persistLearningRoleForPair(
  languageFrom: string,
  languageTo: string,
  role: StoredLearningRole,
): void {
  if (typeof window === 'undefined') return;
  const next = readStoredLearningRolesByPair();
  next[getLearningPairKey(languageFrom, languageTo)] = role;
  localStorage.setItem(LEARNING_ROLE_BY_PAIR_STORAGE_KEY, JSON.stringify(next));
}
