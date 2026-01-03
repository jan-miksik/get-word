// Word normalization and utility functions
import { Word } from '@/data/words';

export interface NormalizedWord extends Word {
  category: string[];
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
    return { ...entry, category };
  });
}

export function getAvailableCategories(words: NormalizedWord[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  words.forEach((word) => {
    word.category.forEach((cat) => {
      if (cat === "word" || cat === "phrase") return;
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
  if (!selectedCategories.size) return true;
  return word.category.some((cat) => selectedCategories.has(cat));
}

export function isDue(progress: { stageIndex: number; nextDueAt?: number }): boolean {
  if (!progress || progress.stageIndex === 0) return false;
  if (!progress.nextDueAt) return false;
  return Date.now() >= progress.nextDueAt;
}

