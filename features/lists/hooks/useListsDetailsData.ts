import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useI18n } from '@/components/I18nProvider';
import * as listActions from '@/features/lists/client/actions';
import type { WordCategory, WordListItem } from '@/features/lists/types';
import { useItemsByCategory } from './useListWizardItems';

type UseListsDetailsDataOptions = {
  selectedListId: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
};

type LoadListDetailsOptions = {
  includeMedia?: boolean;
  signal?: AbortSignal;
  onLoaded?: (items: WordListItem[]) => void;
};

export function useListsDetailsData({
  selectedListId,
  setError,
}: UseListsDetailsDataOptions) {
  const { t } = useI18n();
  const [categories, setCategories] = useState<WordCategory[]>([]);
  const [items, setItems] = useState<WordListItem[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const itemsByCategory = useItemsByCategory(items);

  const beginDetailsTransition = useCallback(() => {
    setLoadingDetails(true);
    setCategories([]);
    setItems([]);
  }, []);

  const reloadListDetails = useCallback(
    async (options: { includeMedia?: boolean } = {}): Promise<WordListItem[]> => {
      if (!selectedListId) return [];
      const details = await listActions.fetchListDetails(selectedListId, {
        includeMedia: options.includeMedia ?? false,
      });
      setCategories(details.categories);
      setItems(details.items);
      return details.items;
    },
    [selectedListId],
  );

  const loadSelectedListDetails = useCallback(async ({
    includeMedia = false,
    signal,
    onLoaded,
  }: LoadListDetailsOptions = {}) => {
    if (!selectedListId) return;
    beginDetailsTransition();
    try {
      const details = await listActions.fetchListDetails(selectedListId, {
        includeMedia,
        signal,
      });
      const freshItems = details.items;
      setCategories(details.categories);
      setItems(freshItems);
      onLoaded?.(freshItems);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : t('lists.loadOneFailed'));
    } finally {
      if (!signal?.aborted) {
        setLoadingDetails(false);
      }
    }
  }, [beginDetailsTransition, selectedListId, setError, t]);

  const createCategory = useCallback(async (name: string): Promise<string | null> => {
    if (!selectedListId) return null;
    const newCategoryId = await listActions.createCategory(selectedListId, name);
    await reloadListDetails();
    return newCategoryId;
  }, [reloadListDetails, selectedListId]);

  const reorderCategories = useCallback(async (orderedIds: string[]) => {
    if (!selectedListId) return;
    await listActions.reorderCategories(selectedListId, orderedIds);
    setCategories((prev) => {
      const byId = new Map(prev.map((category) => [category.id, category]));
      return orderedIds
        .map((id, position) => {
          const category = byId.get(id);
          return category ? { ...category, position } : null;
        })
        .filter((category): category is WordCategory => category !== null);
    });
  }, [selectedListId]);

  const renameCategory = useCallback(async (categoryId: string, name: string) => {
    if (!selectedListId) return;
    await listActions.renameCategory(selectedListId, categoryId, name);
    setCategories((prev) =>
      prev.map((category) => (category.id === categoryId ? { ...category, name } : category)),
    );
  }, [selectedListId]);

  const deleteCategory = useCallback(async (categoryId: string) => {
    if (!selectedListId) return;
    await listActions.deleteCategory(selectedListId, categoryId);
    await reloadListDetails();
  }, [reloadListDetails, selectedListId]);

  const editingLookup = useMemo(() => ({
    categories,
    items,
    itemsByCategory,
  }), [categories, items, itemsByCategory]);

  return {
    categories,
    items,
    itemsByCategory,
    loadingDetails,
    beginDetailsTransition,
    reloadListDetails,
    loadSelectedListDetails,
    createCategory,
    reorderCategories,
    renameCategory,
    deleteCategory,
    editingLookup,
  };
}
