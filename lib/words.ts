// Word normalization and utility functions
import { Word } from '@/data/words';

export interface NormalizedWord extends Word {
  id: string;
  category: string[];
  categoryPositions?: Record<string, number>;
  listPosition?: number;
  listId?: string;
  canonicalWordId?: string | null;
}

// Spaced-repetition stages
export const STAGES = [
  { id: 0, name: "New / forgotten", intervalMs: 0 },
  { id: 1, name: "1 minute", intervalMs: 1 * 60 * 1000 },
  { id: 2, name: "10 minutes", intervalMs: 10 * 60 * 1000 },
  { id: 3, name: "1 hour", intervalMs: 60 * 60 * 1000 },
  { id: 4, name: "8 hours", intervalMs: 8 * 60 * 60 * 1000 },
  { id: 5, name: "1 day", intervalMs: 24 * 60 * 60 * 1000 },
  { id: 6, name: "3 days", intervalMs: 3 * 24 * 60 * 60 * 1000 },
  { id: 7, name: "7 days", intervalMs: 7 * 24 * 60 * 60 * 1000 },
  { id: 8, name: "14 days", intervalMs: 14 * 24 * 60 * 60 * 1000 },
  { id: 9, name: "30 days", intervalMs: 30 * 24 * 60 * 60 * 1000 },
  { id: 10, name: "60 days", intervalMs: 60 * 24 * 60 * 60 * 1000 },
];

export const MEMORY_HOOK_DISABLE_STAGE_OPTIONS = [5, 6, 7, 8, 9, 10] as const;
export type MemoryHookDisableFromStage = (typeof MEMORY_HOOK_DISABLE_STAGE_OPTIONS)[number];
export const DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE: MemoryHookDisableFromStage = 8; // 14 days

export function normalizeMemoryHookDisableFromStage(
  value: unknown
): MemoryHookDisableFromStage {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE;
  const normalized = Math.floor(parsed) as MemoryHookDisableFromStage;
  return MEMORY_HOOK_DISABLE_STAGE_OPTIONS.includes(normalized)
    ? normalized
    : DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE;
}

export function shouldShowMemoryHookForStage(
  stageIndex: number,
  memoryHooksEnabled: boolean,
  memoryHookDisableFromStage: number
): boolean {
  if (!memoryHooksEnabled) return false;
  const normalizedStage = Number.isFinite(stageIndex) ? Math.max(0, Math.floor(stageIndex)) : 0;
  const cutoff = normalizeMemoryHookDisableFromStage(memoryHookDisableFromStage);
  return normalizedStage < cutoff;
}

function inferWordType(entry: Word): 'word' | 'phrase' {
  const explicit = Array.isArray(entry.category)
    ? entry.category.find((tag) => tag === "word" || tag === "phrase")
    : null;
  if (explicit === 'word' || explicit === 'phrase') return explicit;

  // Strip non-letter/number characters (emojis, punctuation) for a fair token count
  const normalized = (entry.cz || "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!normalized) return "word";

  const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
  return tokenCount > 1 ? "phrase" : "word";
}

export function normalizeWords(words: Word[]): NormalizedWord[] {
  return words.map((entry) => {
    const baseTags = Array.isArray(entry.category)
      ? entry.category.filter((tag) => tag !== "word" && tag !== "phrase")
      : [];
    const typeTag = inferWordType(entry);
    const category = [...new Set([...baseTags, typeTag])];
    // id comes from the word data (slova.js)
    return { ...entry, category };
  });
}

export function getAvailableCategories(
  words: NormalizedWord[]
): Array<{ name: string; count: number; position?: number }> {
  const counts = new Map<string, number>();
  const positions = new Map<string, number>();
  words.forEach((word) => {
    word.category.forEach((cat) => {
      if (cat === "word" || cat === "phrase") return;
      counts.set(cat, (counts.get(cat) || 0) + 1);
      const position = word.categoryPositions?.[cat];
      if (typeof position === 'number' && Number.isFinite(position)) {
        const current = positions.get(cat);
        positions.set(cat, current === undefined ? position : Math.min(current, position));
      }
    });
  });
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count, position: positions.get(name) }))
    .sort((a, b) => {
      const aPosition = a.position;
      const bPosition = b.position;
      if (aPosition !== undefined && bPosition !== undefined && aPosition !== bPosition) {
        return aPosition - bPosition;
      }
      if (aPosition !== undefined && bPosition === undefined) return -1;
      if (aPosition === undefined && bPosition !== undefined) return 1;
      return a.name.localeCompare(b.name);
    });
}

function getFilterableWordCategories(word: NormalizedWord): string[] {
  return word.category.filter((cat) => cat !== "word" && cat !== "phrase");
}

type CategorySortKey = {
  source: number;
  value: number | string;
};

function getWordCategorySortKey(
  word: NormalizedWord,
  categoryOrderIndex: Map<string, number>
): CategorySortKey {
  const categories = getFilterableWordCategories(word);
  if (categories.length === 0) return { source: 3, value: "" };

  let best: CategorySortKey | null = null;
  for (const category of categories) {
    const userIndex = categoryOrderIndex.get(category);
    const key =
      userIndex !== undefined
        ? { source: 0, value: userIndex }
        : typeof word.categoryPositions?.[category] === "number" &&
            Number.isFinite(word.categoryPositions[category])
          ? { source: 1, value: word.categoryPositions[category] }
          : { source: 2, value: category };

    if (!best || compareCategorySortKeys(key, best) < 0) {
      best = key;
    }
  }

  return best ?? { source: 3, value: "" };
}

function compareCategorySortKeys(left: CategorySortKey, right: CategorySortKey): number {
  if (left.source !== right.source) return left.source - right.source;
  if (typeof left.value === "number" && typeof right.value === "number") {
    return left.value - right.value;
  }
  return String(left.value).localeCompare(String(right.value));
}

export function createWordCategoryOrderComparer(categoryOrder: string[] = []) {
  const categoryOrderIndex = new Map<string, number>();
  categoryOrder.forEach((name, index) => categoryOrderIndex.set(name, index));

  return (left: NormalizedWord, right: NormalizedWord): number => {
    const categoryComparison = compareCategorySortKeys(
      getWordCategorySortKey(left, categoryOrderIndex),
      getWordCategorySortKey(right, categoryOrderIndex)
    );
    if (categoryComparison !== 0) return categoryComparison;

    const leftPosition = left.listPosition;
    const rightPosition = right.listPosition;
    if (leftPosition !== undefined && rightPosition !== undefined && leftPosition !== rightPosition) {
      return leftPosition - rightPosition;
    }
    if (leftPosition !== undefined) return -1;
    if (rightPosition !== undefined) return 1;
    return 0;
  };
}

// Get all categories from allWords, but count occurrences in filteredWords
// This allows showing categories with 0 count in edit mode
export function getAllCategoriesWithCounts(
  allWords: NormalizedWord[],
  filteredWords: NormalizedWord[],
  additionalCategories: string[] = []
): Array<{ name: string; count: number }> {
  // Start with additional categories first (like edit-only categories)
  // This ensures they're always included even if no words have them
  const allCategories = new Set<string>(additionalCategories);
  
  // Get all unique categories from all words
  allWords.forEach((word) => {
    word.category.forEach((cat) => {
      if (cat !== "word" && cat !== "phrase") {
        allCategories.add(cat);
      }
    });
  });

  // Count occurrences in filtered words
  const counts = new Map<string, number>();
  filteredWords.forEach((word) => {
    word.category.forEach((cat) => {
      if (cat === "word" || cat === "phrase") return;
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
  });

  // Return all categories with their counts (0 if not in filtered words)
  return Array.from(allCategories)
    .map((name) => ({ name, count: counts.get(name) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function matchesCategoryFilter(word: NormalizedWord, selectedCategories: Set<string>): boolean {
  const filterableCategories = word.category.filter((cat) => cat !== "word" && cat !== "phrase");
  if (filterableCategories.length === 0) {
    return selectedCategories.size === 0;
  }
  if (!selectedCategories.size) return false;
  return filterableCategories.some((cat) => selectedCategories.has(cat));
}

export function isDue(progress: { stageIndex: number; nextDueAt?: number }): boolean {
  if (!progress || progress.stageIndex === 0) return false;
  if (!progress.nextDueAt) return false;
  return Date.now() >= progress.nextDueAt;
}

/**
 * Convert word_list_items (from sync API) into NormalizedWord[].
 * Maps the new schema to the existing NormalizedWord shape so the rest of
 * the app (WordCard, minigames, useWordStream) works unchanged.
 */
export function wordListItemsToNormalizedWords(
  items: Array<{
    id: string;
    listId?: string;
    canonicalWordId?: string | null;
    categoryId: string | null;
    textKnown: string;
    textTarget: string | null;
    knownAudioUrl?: string | null;
    knownAudioArweaveUrl?: string | null;
    knownAudioArweaveUrls?: string[];
    audioUrl?: string | null;
    audioArweaveUrl?: string | null;
    audioArweaveUrls?: string[];
    notes: string | null;
    position: number;
  }>,
  categories: Record<string, { name: string; position: number }>,
  _userRole: 'cz' | 'vi',
  opts?: {
    mediaFallbackWords?: Array<
      Pick<NormalizedWord, 'cz' | 'vi' | 'czPron' | 'viPron' | 'czAudio' | 'viAudio'>
    >;
  },
): NormalizedWord[] {
  const normalizePairKeyPart = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toLowerCase();

  const pairKey = (left: string, right: string) =>
    `${normalizePairKeyPart(left)}|${normalizePairKeyPart(right)}`;

  const mediaByPair = new Map<
    string,
    Pick<NormalizedWord, 'czPron' | 'viPron' | 'czAudio' | 'viAudio'>
  >();
  for (const word of opts?.mediaFallbackWords ?? []) {
    mediaByPair.set(pairKey(word.cz, word.vi), {
      czPron: word.czPron,
      viPron: word.viPron,
      czAudio: word.czAudio,
      viAudio: word.viAudio,
    });
  }

  return items
    .filter((item) => item.textKnown && item.textTarget) // minimum viable card
    .map((item) => {
      // Resolve category name(s)
      const catName = item.categoryId
        ? categories[item.categoryId]?.name
        : undefined;
      const baseTags = catName ? [catName] : [];
      const catPosition = item.categoryId
        ? categories[item.categoryId]?.position
        : undefined;

      // Infer word/phrase from textKnown
      const normalized = item.textKnown
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
      const tokenCount = normalized
        ? normalized.split(/\s+/).filter(Boolean).length
        : 1;
      const typeTag = tokenCount > 1 ? 'phrase' : 'word';
      const category = [...new Set([...baseTags, typeTag])];

      // Extract English from notes if stored as "en: ..."
      const enMatch = item.notes?.match(/^en:\s*(.+)$/);
      const en = enMatch ? enMatch[1] : '';

      // Map textKnown/textTarget to cz/vi based on user role
      // The system list has languageFrom=cz, languageTo=vi
      const cz = item.textKnown;
      const vi = item.textTarget!;
      const media =
        mediaByPair.get(pairKey(cz, vi)) ??
        mediaByPair.get(pairKey(vi, cz));
      const generatedKnownAudio = [item.knownAudioUrl, ...(item.knownAudioArweaveUrls ?? [])]
        .filter((url): url is string => Boolean(url));
      const generatedTargetAudio = [item.audioUrl, ...(item.audioArweaveUrls ?? [])]
        .filter((url): url is string => Boolean(url));

      return {
        id: item.id, // UUID from word_list_items
        category,
        categoryPositions:
          catName && typeof catPosition === 'number' && Number.isFinite(catPosition)
            ? { [catName]: catPosition }
            : undefined,
        listPosition: item.position,
        cz,
        en,
        vi,
        czPron: media?.czPron,
        viPron: media?.viPron,
        czAudio:
          generatedKnownAudio.length > 0
            ? generatedKnownAudio
            : media?.czAudio,
        viAudio:
          generatedTargetAudio.length > 0
            ? generatedTargetAudio
            : media?.viAudio,
        listId: item.listId,
        canonicalWordId: item.canonicalWordId ?? null,
      } as NormalizedWord;
    });
}
