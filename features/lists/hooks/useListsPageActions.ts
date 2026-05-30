import { useCallback } from 'react';
import * as listActions from '@/features/lists/client/actions';
import type { WordList, WordListItem } from '@/features/lists/types';

type UpdateListData = Pick<WordList, 'name' | 'description' | 'isPublic'> & {
  isCommon?: boolean;
  isRecommended?: boolean;
  languageFrom?: string;
  languageTo?: string;
};

type UseListsPageActionsOptions = {
  selectedListId: string | null;
  setSelectedListId: (listId: string) => void;
  beginDetailsTransition: () => void;
  clearForkedListPrompt: (listId?: string | null) => void;
  updateSelectedListUrl: (listId: string, forkPrompt?: { sourceName: string } | null) => void;
  addListAndSelect: (list: WordList) => void;
  applyUpdatedList: (list: WordList) => void;
  reloadListDetails: () => Promise<WordListItem[]>;
  onListEdit: () => void;
  onListSelected: () => void;
  onListSidesCleared: (
    clearedSides: ('known' | 'target')[],
    freshItems: WordListItem[],
  ) => void;
  forkedListPrompt: { listId: string; sourceName: string } | null;
};

export function useListsPageActions({
  selectedListId,
  setSelectedListId,
  beginDetailsTransition,
  clearForkedListPrompt,
  updateSelectedListUrl,
  addListAndSelect,
  applyUpdatedList,
  reloadListDetails,
  onListEdit,
  onListSelected,
  onListSidesCleared,
  forkedListPrompt,
}: UseListsPageActionsOptions) {
  const selectList = useCallback((listId: string) => {
    if (listId === selectedListId) {
      clearForkedListPrompt();
      updateSelectedListUrl(listId, null);
      onListSelected();
      return;
    }
    beginDetailsTransition();
    clearForkedListPrompt();
    updateSelectedListUrl(listId, null);
    setSelectedListId(listId);
    onListSelected();
  }, [
    beginDetailsTransition,
    clearForkedListPrompt,
    onListSelected,
    selectedListId,
    setSelectedListId,
    updateSelectedListUrl,
  ]);

  const createList = useCallback(async (name: string, langFrom: string, langTo: string) => {
    const list = await listActions.createList(name, langFrom, langTo);
    clearForkedListPrompt();
    beginDetailsTransition();
    updateSelectedListUrl(list.id, null);
    addListAndSelect(list);
  }, [addListAndSelect, beginDetailsTransition, clearForkedListPrompt, updateSelectedListUrl]);

  const updateList = useCallback(async (listId: string, data: UpdateListData) => {
    const { list: updatedList, clearedSides } = await listActions.updateList(listId, data);
    applyUpdatedList(updatedList);
    if (forkedListPrompt?.listId === listId) {
      clearForkedListPrompt(listId);
    }
    if (clearedSides.length > 0 && selectedListId === listId) {
      const freshItems = await reloadListDetails();
      onListSidesCleared(clearedSides, freshItems);
    }
  }, [
    applyUpdatedList,
    clearForkedListPrompt,
    forkedListPrompt,
    onListSidesCleared,
    reloadListDetails,
    selectedListId,
  ]);

  const editList = useCallback((listId: string) => {
    setSelectedListId(listId);
    onListEdit();
  }, [onListEdit, setSelectedListId]);

  return {
    selectList,
    createList,
    updateList,
    editList,
  };
}
