import type { WordCategory, WordListItem } from '@/features/lists/types';

// Orders list items to match how the learning app displays them: grouped by
// category in the categories' display order (WordCategory.position), then by
// item position within each category. Uncategorized items sort last.
//
// This mirrors createWordCategoryOrderComparer in lib/words.ts, which is what
// the study stream uses, so the editor's later steps (review + audio) list
// words in the same order the learner will see them.
export function orderItemsByCategoryDisplay(
  items: WordListItem[],
  categories: WordCategory[],
): WordListItem[] {
  const categoryPosition = new Map(categories.map((category) => [category.id, category.position]));
  const rankOf = (item: WordListItem): number => {
    if (item.categoryId == null) return Number.POSITIVE_INFINITY;
    return categoryPosition.get(item.categoryId) ?? Number.POSITIVE_INFINITY;
  };
  return [...items].sort((a, b) => rankOf(a) - rankOf(b) || a.position - b.position);
}
