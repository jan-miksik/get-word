import { useCallback, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import * as listActions from '@/features/lists/client/actions';
import {
  readStoredOpenRouterModelOrDefault,
  writeStoredOpenRouterModel,
} from '@/features/lists/client/storage';
import type { PendingFork, WordList } from '@/features/lists/types';

type ForkedListPrompt = { listId: string; sourceName: string };

type UseListsForkingOptions = {
  lists: WordList[];
  initialCreateLanguageFrom: string | null;
  initialCreateLanguageTo: string | null;
  initialForkedListPrompt: ForkedListPrompt | null;
  beginDetailsTransition: () => void;
  addListAndSelect: (list: WordList) => void;
  updateSelectedListUrl: (listId: string, forkPrompt?: { sourceName: string } | null) => void;
  onForkSelected?: () => void;
};

export function useListsForking({
  lists,
  initialCreateLanguageFrom,
  initialCreateLanguageTo,
  initialForkedListPrompt,
  beginDetailsTransition,
  addListAndSelect,
  updateSelectedListUrl,
  onForkSelected,
}: UseListsForkingOptions) {
  const { t } = useI18n();
  const [forkedListPrompt, setForkedListPrompt] = useState<ForkedListPrompt | null>(
    initialForkedListPrompt,
  );
  const [pendingFork, setPendingFork] = useState<PendingFork | null>(null);
  const [forkingListId, setForkingListId] = useState<string | null>(null);

  const clearForkedListPrompt = useCallback((listId?: string | null) => {
    setForkedListPrompt((current) => {
      if (!current) return null;
      if (listId && current.listId !== listId) return current;
      if (listId) updateSelectedListUrl(current.listId, null);
      return null;
    });
  }, [updateSelectedListUrl]);

  const dismissForkNotice = useCallback(() => {
    clearForkedListPrompt(forkedListPrompt?.listId ?? null);
  }, [clearForkedListPrompt, forkedListPrompt]);

  const startFork = useCallback(async (listId: string) => {
    const sourceList = lists.find((list) => list.id === listId);
    if (!sourceList) return;
    setPendingFork({
      source: sourceList,
      languageFrom: initialCreateLanguageFrom ?? sourceList.languageFrom,
      languageTo: initialCreateLanguageTo ?? sourceList.languageTo,
      provider: 'none',
      sourceLanguage: sourceList.languageFrom,
      translationModel: readStoredOpenRouterModelOrDefault(),
    });
  }, [initialCreateLanguageFrom, initialCreateLanguageTo, lists]);

  const updatePendingFork = useCallback((updater: (current: PendingFork) => PendingFork) => {
    setPendingFork((current) => (current ? updater(current) : current));
  }, []);

  const changeForkModel = useCallback((model: string) => {
    setPendingFork((current) =>
      current ? { ...current, translationModel: model } : current,
    );
    writeStoredOpenRouterModel(model);
  }, []);

  const cancelFork = useCallback(() => {
    setPendingFork(null);
  }, []);

  const confirmFork = useCallback(async () => {
    if (!pendingFork || pendingFork.languageFrom === pendingFork.languageTo) return;
    setForkingListId(pendingFork.source.id);
    const { list: forkedList } = await listActions.forkList(pendingFork.source.id, {
      languageFrom: pendingFork.languageFrom,
      languageTo: pendingFork.languageTo,
      translationProvider: pendingFork.provider,
      sourceLanguage: pendingFork.sourceLanguage,
      translationModel: pendingFork.translationModel,
    });
    const sourceName = pendingFork.source.name ?? t('lists.anotherList');
    setForkedListPrompt({ listId: forkedList.id, sourceName });
    beginDetailsTransition();
    updateSelectedListUrl(forkedList.id, { sourceName });
    addListAndSelect(forkedList);
    onForkSelected?.();
    setPendingFork(null);
    setForkingListId(null);
  }, [
    addListAndSelect,
    beginDetailsTransition,
    onForkSelected,
    pendingFork,
    t,
    updateSelectedListUrl,
  ]);

  const resetForking = useCallback(() => {
    setForkingListId(null);
  }, []);

  return {
    forkedListPrompt,
    pendingFork,
    forkingListId,
    clearForkedListPrompt,
    dismissForkNotice,
    startFork,
    updatePendingFork,
    changeForkModel,
    cancelFork,
    confirmFork,
    resetForking,
  };
}
