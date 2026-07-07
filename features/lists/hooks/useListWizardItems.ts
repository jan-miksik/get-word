import { useCallback, useMemo } from "react";
import { orderItemsByCategoryDisplay } from "@/features/lists/orderItems";
import type {
  CompletedTranslationRow,
  ConfirmResult,
  WordCategory,
  WordListItem,
} from "@/features/lists/types";

type PendingItem = NonNullable<ConfirmResult["pending_items"]>[number];

export function useItemsByCategory(items: WordListItem[]) {
  return useMemo(() => {
    const map = new Map<string, WordListItem[]>();
    for (const item of items) {
      const catId = item.categoryId ?? "uncategorized";
      const existing = map.get(catId) ?? [];
      existing.push(item);
      map.set(catId, existing);
    }
    return map;
  }, [items]);
}

export function useBuildAudioStepItems({
  categories,
  editingCategoryId,
  pendingItems,
  selectedListId,
}: {
  categories: WordCategory[];
  editingCategoryId: string | null;
  pendingItems: PendingItem[];
  selectedListId: string | null;
}) {
  return useCallback((
    sourceItems: WordListItem[],
    translationRows: CompletedTranslationRow[] = [],
  ): WordListItem[] => {
    const rowById = new Map(translationRows.map((row) => [row.id, row]));
    const categoryItems = editingCategoryId
      ? sourceItems.filter((item) => item.categoryId === editingCategoryId)
      : sourceItems;
    const mergedItems = categoryItems.map((item) => {
      const row = rowById.get(item.id);
      if (!row) return item;
      return {
        ...item,
        textKnown: row.textKnown,
        textTarget: row.textTarget || null,
        translationStatus: row.status === "error" ? "failed" : item.translationStatus,
      };
    });

    const includedIds = new Set(mergedItems.map((item) => item.id));
    const fallbackItems = translationRows
      .filter((row) => !includedIds.has(row.id))
      .map((row, index) => ({
        id: row.id,
        listId: selectedListId ?? "",
        categoryId: editingCategoryId,
        position: pendingItems.find((item) => item.id === row.id)?.position ?? index,
        textKnown: row.textKnown,
        textTarget: row.textTarget || null,
        translationStatus: row.status === "error" ? "failed" : "translated",
        knownAudioAssetId: null,
        knownAudioStatus: "none",
        knownAudioUrl: null,
        knownAudioArweaveUrl: null,
        knownAudioArweaveUrls: [],
        knownAudioStorageRef: null,
        audioAssetId: null,
        audioStatus: "none",
        audioUrl: null,
        audioArweaveUrl: null,
        audioArweaveUrls: [],
        audioStorageRef: null,
        notes: null,
      }));

    const result = [...mergedItems, ...fallbackItems];
    // Single-category edits stay in that category's position order; the
    // all-words flow is grouped by category to match the app's study order.
    return editingCategoryId
      ? result.sort((a, b) => a.position - b.position)
      : orderItemsByCategoryDisplay(result, categories);
  }, [categories, editingCategoryId, pendingItems, selectedListId]);
}
