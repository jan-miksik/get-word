'use client';

import type { ViewMode } from './types';

const ACTIVE_LIST_STORAGE_KEY = 'get-word-active-list';
const VIEW_MODE_STORAGE_KEY = 'get-word-view-mode';
const CATEGORY_FILTERS_STORAGE_KEY = 'get-word-category-filters-by-list';
const PWA_INSTALL_PROMPT_ANSWERED_KEY = 'get-word-pwa-install-prompt-answered';
const RATE_APP_PROMPT_ANSWERED_KEY = 'get-word-rate-app-prompt-answered';
const STUDIED_CARD_COUNT_KEY = 'get-word-studied-card-count';
const FIRST_STUDY_AT_KEY = 'get-word-first-study-at';

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
  void mode;
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

export function readPWAInstallPromptAnswered(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(PWA_INSTALL_PROMPT_ANSWERED_KEY) === '1';
}

export function persistPWAInstallPromptAnswered(answered: boolean): void {
  if (typeof window === 'undefined') return;
  if (answered) {
    localStorage.setItem(PWA_INSTALL_PROMPT_ANSWERED_KEY, '1');
  } else {
    localStorage.removeItem(PWA_INSTALL_PROMPT_ANSWERED_KEY);
  }
}

export function readRateAppPromptAnswered(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(RATE_APP_PROMPT_ANSWERED_KEY) === '1';
}

export function persistRateAppPromptAnswered(answered: boolean): void {
  if (typeof window === 'undefined') return;
  if (answered) {
    localStorage.setItem(RATE_APP_PROMPT_ANSWERED_KEY, '1');
  } else {
    localStorage.removeItem(RATE_APP_PROMPT_ANSWERED_KEY);
  }
}

export interface StudyMilestone {
  /** Cards completed across all sessions on this device. */
  studiedCards: number;
  /** Epoch ms of the first card ever completed here, or null before the first. */
  firstStudyAt: number | null;
}

const EMPTY_STUDY_MILESTONE: StudyMilestone = { studiedCards: 0, firstStudyAt: null };

export function readStudyMilestone(): StudyMilestone {
  if (typeof window === 'undefined') return EMPTY_STUDY_MILESTONE;
  const storedCount = Number.parseInt(localStorage.getItem(STUDIED_CARD_COUNT_KEY) ?? '', 10);
  const storedFirst = Number.parseInt(localStorage.getItem(FIRST_STUDY_AT_KEY) ?? '', 10);
  return {
    studiedCards: Number.isFinite(storedCount) && storedCount > 0 ? storedCount : 0,
    firstStudyAt: Number.isFinite(storedFirst) && storedFirst > 0 ? storedFirst : null,
  };
}

/**
 * Counts one completed study card and returns the updated milestone. The count
 * has to survive reloads — the rating prompt is meant to appear after sustained
 * use, which a per-session counter cannot tell apart from one long first sitting.
 */
export function recordStudiedCard(now: number = Date.now()): StudyMilestone {
  const current = readStudyMilestone();
  const next: StudyMilestone = {
    studiedCards: current.studiedCards + 1,
    firstStudyAt: current.firstStudyAt ?? now,
  };
  if (typeof window === 'undefined') return next;
  try {
    localStorage.setItem(STUDIED_CARD_COUNT_KEY, String(next.studiedCards));
    localStorage.setItem(FIRST_STUDY_AT_KEY, String(next.firstStudyAt));
  } catch {
    // Studying must not break because storage is full or blocked; the prompt
    // simply never reaches its threshold in that case.
  }
  return next;
}
