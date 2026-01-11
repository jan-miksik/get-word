// localStorage utilities for user-specific data
// This data stays in localStorage (no sync for now)

const STORAGE_KEY = "wordlink_progress_v1";
const ROLE_KEY = "wordlink_role_v1";
const MEMORY_HOOK_KEY = "wordlink_memory_hooks_v1";
const CATEGORY_FILTER_KEY = "wordlink_category_filter_v1";
const SHOW_ENGLISH_KEY = "wordlink_show_english_v1";
const SHOW_CATEGORY_BADGES_KEY = "wordlink_show_category_badges_v1";
const MIGRATION_KEY = "wordlink_migrated_to_ids_v1";

export interface ProgressData {
  stageIndex: number;
  knownCount: number;
  unknownCount: number;
  lastKnownAt?: number;
  lastUnknownAt?: number;
  nextDueAt?: number;
}

// Check if migration has already been done
export function hasMigratedToIds(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(MIGRATION_KEY) === 'true';
}

// Mark migration as complete
export function markMigrationComplete(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MIGRATION_KEY, 'true');
}

// Generate the old hash-based ID (for migration purposes)
// This matches the old generateWordId function
export function generateOldHashId(cz: string, vi: string, en: string): string {
  const content = `${cz}|${vi}|${en}`;
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Progress storage - uses string word IDs as keys
// Accepts optional maps for migrating old data:
// - indexToIdMap: old numeric index -> new ID (e.g., 5 -> "w005")
// - hashToIdMap: old hash ID -> new ID (e.g., "ffkl5c" -> "w000")
export function loadProgress(
  indexToIdMap?: Map<number, string>,
  hashToIdMap?: Map<string, string>,
  needsMigration?: boolean
): Record<string, ProgressData> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      console.log('[Migration] No progress data in localStorage');
      return {};
    }
    const parsed = JSON.parse(raw);
    const result: Record<string, ProgressData> = {};
    
    console.log('[Migration] Loading progress, needsMigration:', needsMigration);
    console.log('[Migration] hashToIdMap size:', hashToIdMap?.size);
    console.log('[Migration] Keys in localStorage:', Object.keys(parsed).slice(0, 5).join(', '), '...');
    
    let didMigrate = false;
    
    for (const [key, value] of Object.entries(parsed)) {
      const data = value as any;
      let progressData: ProgressData;
      
      // Handle old categoryIndex format
      if (data.categoryIndex !== undefined) {
        progressData = {
          stageIndex: Math.max(0, Math.min(data.categoryIndex, 10)),
          knownCount: data.knownCount || 0,
          unknownCount: data.unknownCount || 0,
          lastKnownAt: data.lastKnownAt,
          lastUnknownAt: data.lastUnknownAt,
          nextDueAt: data.nextDueAt,
        };
      } else if (data.stageIndex !== undefined) {
        progressData = data as ProgressData;
      } else {
        continue;
      }
      
      // Try to migrate the key to new format
      let newKey = key;
      
      if (needsMigration) {
        // First check if it's a numeric index
        const numericIndex = parseInt(key, 10);
        if (!isNaN(numericIndex) && indexToIdMap?.has(numericIndex)) {
          newKey = indexToIdMap.get(numericIndex)!;
          console.log('[Migration] Numeric key', key, '->', newKey);
          didMigrate = true;
        }
        // Then check if it's an old hash ID
        else if (hashToIdMap?.has(key)) {
          newKey = hashToIdMap.get(key)!;
          console.log('[Migration] Hash key', key, '->', newKey);
          didMigrate = true;
        } else {
          console.log('[Migration] Key not found in maps:', key);
        }
      }
      
      result[newKey] = progressData;
    }
    
    // If we migrated, save the new format
    if (didMigrate) {
      saveProgress(result);
      console.log(`[Migration] Saved ${Object.keys(result).length} progress entries with new word IDs`);
    } else {
      console.log('[Migration] No migration needed or no keys matched');
    }
    
    return result;
  } catch (e) {
    console.error('[Migration] Error:', e);
    return {};
  }
}

export function saveProgress(progress: Record<string, ProgressData>): void {
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

// Memory hooks storage - uses string word IDs as keys
// Accepts optional maps for migrating old data:
// - indexToIdMap: old numeric index -> new ID (e.g., 5 -> "w005")
// - hashToIdMap: old hash ID -> new ID (e.g., "ffkl5c" -> "w000")
export function loadMemoryHooks(
  indexToIdMap?: Map<number, string>,
  hashToIdMap?: Map<string, string>,
  needsMigration?: boolean
): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MEMORY_HOOK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const hooks: Record<string, string> = {};
    
    let didMigrate = false;
    
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') continue;
      
      // Try to migrate the key to new format
      let newKey = key;
      
      if (needsMigration) {
        // First check if it's a numeric index
        const numericIndex = parseInt(key, 10);
        if (!isNaN(numericIndex) && indexToIdMap?.has(numericIndex)) {
          newKey = indexToIdMap.get(numericIndex)!;
          didMigrate = true;
        }
        // Then check if it's an old hash ID
        else if (hashToIdMap?.has(key)) {
          newKey = hashToIdMap.get(key)!;
          didMigrate = true;
        }
      }
      
      hooks[newKey] = value;
    }
    
    // If we migrated, save the new format
    if (didMigrate) {
      saveMemoryHooks(hooks);
      console.log(`Migrated ${Object.keys(hooks).length} memory hooks to new word IDs`);
    }
    
    return hooks;
  } catch {
    return {};
  }
}

export function saveMemoryHooks(hooks: Record<string, string>): void {
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

