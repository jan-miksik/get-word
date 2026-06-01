import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { listsApiFetch } from '@/features/lists/api';
import * as listActions from '@/features/lists/client/actions';
import { readStoredSelectedListId, writeStoredSelectedListId } from '@/features/lists/client/storage';
import { isSameListDirection } from '@/features/lists/languages';
import type { WordList } from '@/features/lists/types';

type UseListsPageDataOptions = {
  initialSelectedListId?: string | null;
  loadGoogleUsage: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
};

export function useListsPageData({
  initialSelectedListId,
  loadGoogleUsage,
  setError,
}: UseListsPageDataOptions) {
  const { t } = useI18n();
  const [lists, setLists] = useState<WordList[]>([]);
  const [selectedListId, setSelectedListIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribedListIds, setSubscribedListIds] = useState<Set<string>>(new Set());
  const [canManageCommonLists, setCanManageCommonLists] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadLists() {
      try {
        void loadGoogleUsage();
        const res = await listsApiFetch('/api/lists');
        if (!res.ok) throw new Error(t('lists.loadFailed'));
        const data = await res.json();
        if (cancelled) return;

        const loadedLists = Array.isArray(data.lists) ? data.lists as WordList[] : [];
        setLists(loadedLists);
        setCanManageCommonLists(Boolean(data.canManageCommonLists));
        setSelectedListIdState((current) => {
          if (current || loadedLists.length === 0) return current;
          if (initialSelectedListId && loadedLists.some((list) => list.id === initialSelectedListId)) {
            writeStoredSelectedListId(initialSelectedListId);
            return initialSelectedListId;
          }
          const storedSelectedListId = readStoredSelectedListId();
          if (storedSelectedListId && loadedLists.some((list) => list.id === storedSelectedListId)) {
            return storedSelectedListId;
          }
          const owned = loadedLists.find((list) => list.ownerId !== null);
          const nextSelectedListId = owned?.id ?? loadedLists[0].id;
          writeStoredSelectedListId(nextSelectedListId);
          return nextSelectedListId;
        });
        setSubscribedListIds(new Set<string>(data.subscribedListIds ?? []));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('lists.loadFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadLists();

    return () => {
      cancelled = true;
    };
  }, [initialSelectedListId, loadGoogleUsage, setError, t]);

  const selectedList = useMemo(
    () => lists.find((list) => list.id === selectedListId) ?? null,
    [lists, selectedListId],
  );

  const isOwner = useMemo(() => {
    if (!selectedList) return false;
    return selectedList.isOwner ?? selectedList.ownerId !== null;
  }, [selectedList]);

  const setSelectedListId = useCallback((listId: string | null) => {
    writeStoredSelectedListId(listId);
    setSelectedListIdState(listId);
  }, []);

  const addListAndSelect = useCallback((list: WordList) => {
    setLists((prev) => [...prev, list]);
    setSelectedListId(list.id);
  }, [setSelectedListId]);

  const applyUpdatedList = useCallback((updatedList: WordList) => {
    setLists((prev) =>
      prev.map((list) => {
        if (list.id === updatedList.id) return { ...list, ...updatedList };
        return {
          ...list,
          ...(updatedList.isCommon ? { isCommon: false } : {}),
          ...(updatedList.isRecommended && isSameListDirection(list, updatedList)
            ? { isRecommended: false }
            : {}),
        };
      }),
    );
  }, []);

  const deleteList = useCallback(async (listId: string) => {
    try {
      await listActions.deleteList(listId);

      setLists((prev) => {
        const next = prev.filter((list) => list.id !== listId);
        const nextOwned = next.find((list) => list.ownerId !== null);
        setSelectedListIdState((current) => (
          current === listId
            ? (() => {
                const nextSelectedListId = nextOwned?.id ?? next[0]?.id ?? null;
                writeStoredSelectedListId(nextSelectedListId);
                return nextSelectedListId;
              })()
            : current
        ));
        return next;
      });

      setSubscribedListIds((prev) => {
        const next = new Set(prev);
        next.delete(listId);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lists.deleteFailed'));
    }
  }, [setError, t]);

  const subscribeToList = useCallback(async (listId: string) => {
    try {
      await listActions.subscribeToList(listId);
      setSubscribedListIds((prev) => new Set([...prev, listId]));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lists.subscribeFailed'));
    }
  }, [setError, t]);

  const unsubscribeFromList = useCallback(async (listId: string) => {
    try {
      await listActions.unsubscribeFromList(listId);
      setSubscribedListIds((prev) => {
        const next = new Set(prev);
        next.delete(listId);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lists.unsubscribeFailed'));
    }
  }, [setError, t]);

  return {
    lists,
    selectedListId,
    selectedList,
    isOwner,
    loading,
    subscribedListIds,
    canManageCommonLists,
    setSelectedListId,
    addListAndSelect,
    applyUpdatedList,
    deleteList,
    subscribeToList,
    unsubscribeFromList,
  };
}
