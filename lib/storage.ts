// localStorage utilities for user-specific data
// This data stays in localStorage (no sync for now)

const STORAGE_KEY = "wordlink_progress_v1";
const ROLE_KEY = "wordlink_role_v1";
const MEMORY_HOOK_KEY = "wordlink_memory_hooks_v1";
const CATEGORY_FILTER_KEY = "wordlink_category_filter_v1";
const SHOW_ENGLISH_KEY = "wordlink_show_english_v1";
const SHOW_CATEGORY_BADGES_KEY = "wordlink_show_category_badges_v1";

export interface ProgressData {
  stageIndex: number;
  knownCount: number;
  unknownCount: number;
  lastKnownAt?: number;
  lastUnknownAt?: number;
  nextDueAt?: number;
}

// Progress storage
export function loadProgress(): Record<number, ProgressData> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Migrate old format if needed
    const migrated: Record<number, ProgressData> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const index = parseInt(key, 10);
      if (isNaN(index)) continue;
      const data = value as any;
      if (data.stageIndex !== undefined) {
        migrated[index] = data as ProgressData;
      } else if (data.categoryIndex !== undefined) {
        // Migrate old format
        migrated[index] = {
          stageIndex: Math.max(0, Math.min(data.categoryIndex, 10)),
          knownCount: data.knownCount || 0,
          unknownCount: data.unknownCount || 0,
          lastKnownAt: data.lastKnownAt,
          lastUnknownAt: data.lastUnknownAt,
          nextDueAt: data.nextDueAt,
        };
      }
    }
    return migrated;
  } catch {
    return {};
  }
}

export function saveProgress(progress: Record<number, ProgressData>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

// Role storage
export function loadRole(): 'cz' | 'vi' {
  if (typeof window === 'undefined') return 'vi';
  try {
    const raw = localStorage.getItem(ROLE_KEY);
    if (raw === 'cz' || raw === 'vi') return raw;
  } catch {
    // ignore
  }
  return 'vi';
}

export function saveRole(role: 'cz' | 'vi'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    // ignore
  }
}

// Memory hooks storage
export function loadMemoryHooks(): Record<number, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MEMORY_HOOK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const hooks: Record<number, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const index = parseInt(key, 10);
      if (!isNaN(index) && typeof value === 'string') {
        hooks[index] = value;
      }
    }
    return hooks;
  } catch {
    return {};
  }
}

export function saveMemoryHooks(hooks: Record<number, string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MEMORY_HOOK_KEY, JSON.stringify(hooks));
  } catch {
    // ignore
  }
}

// Category filter storage
export function loadCategoryFilter(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(CATEGORY_FILTER_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const cleaned = parsed.filter(
      (item) => typeof item === 'string' && item !== 'word' && item !== 'phrase'
    );
    return new Set(cleaned);
  } catch {
    return new Set();
  }
}

export function saveCategoryFilter(categories: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CATEGORY_FILTER_KEY, JSON.stringify(Array.from(categories)));
  } catch {
    // ignore
  }
}

// Show English storage (default: true)
export function loadShowEnglish(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(SHOW_ENGLISH_KEY);
    if (raw === null) return true; // default to true
    return raw === 'true';
  } catch {
    return true;
  }
}

export function saveShowEnglish(show: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SHOW_ENGLISH_KEY, String(show));
  } catch {
    // ignore
  }
}

// Show Category Badges storage (default: false)
export function loadShowCategoryBadges(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(SHOW_CATEGORY_BADGES_KEY);
    if (raw === null) return false; // default to false
    return raw === 'true';
  } catch {
    return false;
  }
}

export function saveShowCategoryBadges(show: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SHOW_CATEGORY_BADGES_KEY, String(show));
  } catch {
    // ignore
  }
}

