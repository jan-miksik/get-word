'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { listsApiFetch } from '@/features/lists/api';
import * as listActions from '@/features/lists/client/actions';
import {
  consumeOneShotListsUrlParams,
  readInitialListsUrlState,
  selectedListUrl,
} from '@/features/lists/client/url-state';
import {
  readStoredOpenRouterModelOrDefault,
  writeStoredOpenRouterModel,
} from '@/features/lists/client/storage';
import { isSameListDirection } from '@/features/lists/languages';
import { useLearningLanguages } from '@/features/lists/hooks/useLearningLanguages';
import { useListsSettingsLanguage } from '@/features/lists/hooks/useListsSettingsLanguage';
import { useItemsByCategory } from '@/features/lists/hooks/useListWizardItems';
import { useListsWizard } from '@/features/lists/hooks/useListsWizard';
import type {
  GoogleUsageResponse,
  PendingFork,
  WordCategory,
  WordList,
  WordListItem,
} from '@/features/lists/types';
import { ErrorMessage } from './ErrorMessage';
import { ListSidebar } from './ListSidebar';
import { CategoryBrowser } from './CategoryBrowser';
import { TextareaEditor } from './TextareaEditor';
import { DiffPreview } from './DiffPreview';
import { TranslationStep } from './TranslationStep';
import { AudioStep } from './AudioStep';
import { ApiKeySettings } from './ApiKeySettings';
import { PendingForkDialog } from './PendingForkDialog';
import { WizardProgressBar, type WizardActiveStep } from './WizardProgressBar';

type ForkedListPrompt = { listId: string; sourceName: string };

export default function ListsPage() {
  const settingsLanguage = useListsSettingsLanguage();

  return (
    <I18nProvider language={settingsLanguage}>
      <ListsPageContent />
    </I18nProvider>
  );
}

function ListsPageContent() {
  const { t } = useI18n();
  const [lists, setLists] = useState<WordList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [categories, setCategories] = useState<WordCategory[]>([]);
  const [items, setItems] = useState<WordListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subscribedListIds, setSubscribedListIds] = useState<Set<string>>(new Set());
  const [openCreateSignal, setOpenCreateSignal] = useState(0);
  const [initialCreateLanguageFrom, setInitialCreateLanguageFrom] = useState<string | null>(null);
  const [initialCreateLanguageTo, setInitialCreateLanguageTo] = useState<string | null>(null);
  const [existingListsHint, setExistingListsHint] = useState(false);
  const languages = useLearningLanguages();
  const [googleUsage, setGoogleUsage] = useState<GoogleUsageResponse | null>(null);
  const [forkedListPrompt, setForkedListPrompt] = useState<ForkedListPrompt | null>(null);
  const [canManageCommonLists, setCanManageCommonLists] = useState(false);
  const [initialAudioFixStep, setInitialAudioFixStep] = useState<'audio-target' | 'audio-known' | null>(null);
  const [pendingFork, setPendingFork] = useState<PendingFork | null>(null);
  const [forkingListId, setForkingListId] = useState<string | null>(null);

  const selectedList = useMemo(
    () => lists.find((l) => l.id === selectedListId) ?? null,
    [lists, selectedListId]
  );

  const isOwner = useMemo(() => {
    if (!selectedList) return false;
    return selectedList.isOwner ?? selectedList.ownerId !== null;
  }, [selectedList]);

  const updateSelectedListUrl = useCallback((
    listId: string,
    forkPrompt?: { sourceName: string } | null,
  ) => {
    if (typeof window === 'undefined') return;
    window.history.replaceState(null, '', selectedListUrl(listId, forkPrompt));
  }, []);

  const loadGoogleUsage = useCallback(async () => {
    try {
      const res = await listsApiFetch('/api/google-usage');
      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error(t('lists.googleUsageLoadFailed'));
      }
      const data = await res.json();
      setGoogleUsage(data);
    } catch {
    }
  }, [t]);

  // Fetch lists and subscription status on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const initialUrlState = readInitialListsUrlState(window.location.search);
    if (initialUrlState.settingsOpen) setSettingsOpen(true);
    if (initialUrlState.initialCreateLanguageFrom) {
      setInitialCreateLanguageFrom(initialUrlState.initialCreateLanguageFrom);
    }
    if (initialUrlState.initialCreateLanguageTo) {
      setInitialCreateLanguageTo(initialUrlState.initialCreateLanguageTo);
    }
    if (initialUrlState.shouldOpenCreate) {
      setOpenCreateSignal((value) => value + 1);
    }
    if (initialUrlState.existingListsHint) {
      setExistingListsHint(true);
    }
    if (initialUrlState.forkedListPrompt) {
      setForkedListPrompt(initialUrlState.forkedListPrompt);
    }
    if (initialUrlState.initialAudioFixStep) {
      setInitialAudioFixStep(initialUrlState.initialAudioFixStep);
      window.history.replaceState(null, '', consumeOneShotListsUrlParams(window.location.search));
    }
    if (initialUrlState.notice) {
      setError(initialUrlState.notice);
      window.history.replaceState(null, '', consumeOneShotListsUrlParams(window.location.search));
    }
  }, []);

  useEffect(() => {
    async function loadLists() {
      try {
        void loadGoogleUsage();
        const res = await listsApiFetch('/api/lists');
        if (!res.ok) throw new Error(t('lists.loadFailed'));
        const data = await res.json();
        setLists(data.lists);
        setCanManageCommonLists(Boolean(data.canManageCommonLists));
        setSelectedListId((current) => {
          if (current || data.lists.length === 0) return current;
          if (typeof window !== 'undefined') {
            const selected = new URLSearchParams(window.location.search).get('selected');
            if (selected && data.lists.some((l: WordList) => l.id === selected)) return selected;
          }
          const owned = data.lists.find((l: WordList) => l.ownerId !== null);
          return owned?.id ?? data.lists[0].id;
        });
        setSubscribedListIds(new Set<string>(data.subscribedListIds ?? []));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('lists.loadFailed'));
      } finally {
        setLoading(false);
      }
    }
    loadLists();
  }, [loadGoogleUsage, t]);

  const itemsByCategory = useItemsByCategory(items);

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

  const wizard = useListsWizard({
    selectedListId,
    items,
    itemsByCategory,
    reloadListDetails,
    loadGoogleUsage,
  });

  // Fetch list details when selected list changes.
  useEffect(() => {
    if (!selectedListId) return;
    const listId = selectedListId;
    const controller = new AbortController();
    setLoadingDetails(true);
    setCategories([]);
    setItems([]);
    async function loadListDetails() {
      try {
        const details = await listActions.fetchListDetails(listId, {
          includeMedia: false,
          signal: controller.signal,
        });
        const freshItems = details.items;
        setCategories(details.categories);
        setItems(freshItems);
        if (initialAudioFixStep) {
          wizard.openAudioStepFromFix(freshItems, initialAudioFixStep);
          setInitialAudioFixStep(null);
        } else {
          wizard.showBrowse();
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : t('lists.loadOneFailed'));
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDetails(false);
        }
      }
    }
    loadListDetails();
    wizard.resetForListChange();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAudioFixStep, selectedListId, t]);

  const handleSelectList = useCallback((listId: string) => {
    if (listId === selectedListId) {
      setForkedListPrompt(null);
      updateSelectedListUrl(listId, null);
      setSidebarOpen(false);
      return;
    }
    setLoadingDetails(true);
    setCategories([]);
    setItems([]);
    setForkedListPrompt(null);
    updateSelectedListUrl(listId, null);
    setSelectedListId(listId);
    setSidebarOpen(false);
  }, [selectedListId, updateSelectedListUrl]);

  const handleCreateList = useCallback(async (name: string, langFrom: string, langTo: string) => {
    const list = await listActions.createList(name, langFrom, langTo);
    setLists((prev) => [...prev, list]);
    setForkedListPrompt(null);
    setLoadingDetails(true);
    setCategories([]);
    setItems([]);
    updateSelectedListUrl(list.id, null);
    setSelectedListId(list.id);
  }, [updateSelectedListUrl]);

  const handleUpdateList = useCallback(async (
    listId: string,
    data: Pick<WordList, 'name' | 'description' | 'isPublic'> & {
      isCommon?: boolean;
      isRecommended?: boolean;
      languageFrom?: string;
      languageTo?: string;
    },
  ) => {
    const { list: updatedList, clearedSides } = await listActions.updateList(listId, data);
    setLists((prev) =>
      prev.map((list) => {
        if (list.id === listId) return { ...list, ...updatedList };
        return {
          ...list,
          ...(updatedList.isCommon ? { isCommon: false } : {}),
          ...(updatedList.isRecommended && isSameListDirection(list, updatedList)
            ? { isRecommended: false }
            : {}),
        };
      })
    );
    if (forkedListPrompt?.listId === listId) {
      setForkedListPrompt(null);
      updateSelectedListUrl(listId, null);
    }
    if (clearedSides.length > 0 && selectedListId === listId) {
      const freshItems = await reloadListDetails();
      wizard.startAllWordsReviewAfterSideClear(clearedSides, freshItems);
    }
  }, [forkedListPrompt, reloadListDetails, selectedListId, updateSelectedListUrl, wizard]);

  const handleForkList = useCallback(async (listId: string) => {
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

  const handlePendingForkModelChange = useCallback((model: string) => {
    setPendingFork((current) =>
      current ? { ...current, translationModel: model } : current
    );
    writeStoredOpenRouterModel(model);
  }, []);

  const handleConfirmFork = useCallback(async () => {
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
    setLists((prev) => [...prev, forkedList]);
    setForkedListPrompt({ listId: forkedList.id, sourceName });
    setLoadingDetails(true);
    setCategories([]);
    setItems([]);
    updateSelectedListUrl(forkedList.id, { sourceName });
    setSelectedListId(forkedList.id);
    setSidebarOpen(false);
    setPendingFork(null);
    setForkingListId(null);
  }, [pendingFork, t, updateSelectedListUrl]);

  const handleEditList = useCallback((listId: string) => {
    setSelectedListId(listId);
    wizard.triggerEdit();
    setSidebarOpen(false);
  }, [wizard]);

  const handleDismissForkNotice = useCallback(() => {
    setForkedListPrompt((current) => {
      if (!current) return null;
      updateSelectedListUrl(current.listId, null);
      return null;
    });
  }, [updateSelectedListUrl]);

  const handleDeleteList = useCallback(async (listId: string) => {
    try {
      await listActions.deleteList(listId);

      setLists((prev) => {
        const next = prev.filter((l) => l.id !== listId);
        const nextOwned = next.find((l) => l.ownerId !== null);
        setSelectedListId((current) => (
          current === listId
            ? (nextOwned?.id ?? next[0]?.id ?? null)
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
  }, [t]);

  const handleSubscribe = useCallback(async (listId: string) => {
    try {
      await listActions.subscribeToList(listId);
      setSubscribedListIds((prev) => new Set([...prev, listId]));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lists.subscribeFailed'));
    }
  }, [t]);

  const handleUnsubscribe = useCallback(async (listId: string) => {
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
  }, [t]);

  const handleCreateCategory = useCallback(async (name: string) => {
    if (!selectedListId) return;
    await listActions.createCategory(selectedListId, name);
    await reloadListDetails();
  }, [selectedListId]);

  const handleReorderCategories = useCallback(async (orderedIds: string[]) => {
    if (!selectedListId) return;
    await listActions.reorderCategories(selectedListId, orderedIds);
    // Optimistically reorder locally
    setCategories((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      return orderedIds
        .map((id, i) => {
          const cat = byId.get(id);
          return cat ? { ...cat, position: i } : null;
        })
        .filter((c): c is WordCategory => c !== null);
    });
  }, [selectedListId]);

  const handleRenameCategory = useCallback(async (categoryId: string, name: string) => {
    if (!selectedListId) return;
    await listActions.renameCategory(selectedListId, categoryId, name);
    setCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, name } : c))
    );
  }, [selectedListId]);

  const handleDeleteCategory = useCallback(async (categoryId: string) => {
    if (!selectedListId) return;
    await listActions.deleteCategory(selectedListId, categoryId);
    await reloadListDetails();
  }, [selectedListId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-text">
        <div className="text-text-soft">{t('common.loadingLists')}</div>
      </div>
    );
  }

  const editingCategory = categories.find((c) => c.id === wizard.editingCategoryId);
  const editingItems = wizard.editingCategoryId ? itemsByCategory.get(wizard.editingCategoryId) ?? [] : [];
  const currentAudioItems = wizard.audioStepItems ?? (wizard.editingCategoryId ? editingItems : items);
  const languageOptions = languages.length > 0 ? languages : [
    { code: 'cs', name: t('languageName.cs') },
    { code: 'vi', name: t('languageName.vi') },
    { code: 'en', name: t('languageName.en') },
  ];

  return (
    <div className="flex h-screen bg-background text-text overflow-hidden">
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-background-elevated border border-border-subtle md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={t('lists.toggleSidebar')}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-text">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Settings button */}
      <button
        type="button"
        className="fixed top-4 right-4 z-50 p-2 rounded-lg bg-background-elevated border border-border-subtle text-text-soft hover:text-text transition-colors"
        onClick={() => setSettingsOpen(true)}
        aria-label={t('lists.settings')}
        title={t('lists.apiKeys')}
      >
        {/* Key icon */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-current">
          <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11.5 11.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M14.5 14.5L16 13l1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <ApiKeySettings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-40 w-72 border-r border-border-subtle bg-background-elevated
        transform transition-transform duration-200
        md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <ListSidebar
          lists={lists}
          selectedListId={selectedListId}
          subscribedListIds={subscribedListIds}
          googleUsage={googleUsage}
          languages={languages}
          canManageCommonLists={canManageCommonLists}
          initialCreateLanguageFrom={initialCreateLanguageFrom}
          initialCreateLanguageTo={initialCreateLanguageTo}
          onSelectList={handleSelectList}
          onCreateList={handleCreateList}
          onDeleteList={handleDeleteList}
          onEditList={handleEditList}
          onSubscribe={handleSubscribe}
          onUnsubscribe={handleUnsubscribe}
          onFork={handleForkList}
          openCreateSignal={openCreateSignal}
        />
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {wizard.wizardStep !== 'browse' && selectedList && (
          <WizardProgressBar
            currentStep={wizard.wizardStep as WizardActiveStep}
            onGoToStep={wizard.handleGoToStep}
            canJumpForward={!wizard.isEditDirty}
            availableSteps={wizard.editingAllWords ? ['translate', 'audio-target', 'audio-known'] : undefined}
          />
        )}

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 m-4 rounded-lg bg-danger/10 text-danger text-sm">
              <ErrorMessage message={error} />
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setError(null)}
              >
                {t('common.close')}
              </button>
            </div>
          )}

          {existingListsHint && (
            <div className="p-4 m-4 rounded-lg border border-border-subtle bg-background-elevated text-sm text-text-soft">
              {t('lists.createFromExistingHint')}
              <button
                type="button"
                className="ml-2 text-accent underline"
                onClick={() => setExistingListsHint(false)}
              >
                {t('common.close')}
              </button>
            </div>
          )}

          {!selectedList ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-soft">{t('lists.startBySelecting')}</p>
            </div>
          ) : loadingDetails ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-soft">{t('app.loading')}</p>
            </div>
          ) : wizard.wizardStep === 'browse' ? (
            <CategoryBrowser
              list={selectedList}
              categories={categories}
              itemsByCategory={itemsByCategory}
              languages={languages}
              isOwner={isOwner}
              isEditor={canManageCommonLists}
              forkedFromListName={forkedListPrompt?.listId === selectedList.id ? forkedListPrompt.sourceName : null}
              triggerEditSignal={wizard.triggerEditSignal}
              onEditCategory={wizard.handleEditCategory}
              onEditAllWords={wizard.handleEditAllWords}
              onCreateCategory={handleCreateCategory}
              onUpdateList={handleUpdateList}
              onDismissForkNotice={handleDismissForkNotice}
              onRenameCategory={handleRenameCategory}
              onReorderCategories={handleReorderCategories}
              onDeleteCategory={handleDeleteCategory}
              onFork={handleForkList}
              onDeleteList={handleDeleteList}
            />
          ) : wizard.wizardStep === 'edit' ? (
            <TextareaEditor
              category={editingCategory!}
              items={editingItems}
              inputLanguage={wizard.editInputLanguage}
              onInputLanguageChange={wizard.setEditInputLanguage}
              onPreview={wizard.handlePreview}
              onCancel={wizard.handleCancelWizard}
              onDirtyChange={wizard.setIsEditDirty}
            />
          ) : wizard.wizardStep === 'preview' ? (
            <DiffPreview
              diff={wizard.diffResult!}
              existingItems={editingItems}
              onConfirm={wizard.handleConfirm}
              onCancel={wizard.handleCancelWizard}
              onBack={wizard.handleGoBack}
            />
          ) : wizard.wizardStep === 'translate' ? (
            <TranslationStep
              list={selectedList}
              pendingItems={wizard.pendingItems ?? []}
              inputLanguage={wizard.editInputLanguage}
              heading={t(
                wizard.translateHeadingMode === 'review'
                  ? 'lists.reviewTranslationsAndAudio'
                  : 'lists.translateWords',
              )}
              googleUsage={googleUsage}
              onComplete={wizard.handleTranslationComplete}
              onSkip={wizard.handleSkipTranslation}
              onUsageRefresh={loadGoogleUsage}
              onBack={wizard.handleGoBack}
            />
          ) : wizard.wizardStep === 'audio-target' ? (
            <AudioStep
              list={selectedList}
              items={currentAudioItems}
              audioSide="target"
              title={t('lists.audioTarget')}
              googleUsage={googleUsage}
              onComplete={wizard.handleTargetAudioComplete}
              onSkip={wizard.handleTargetAudioComplete}
              onUsageRefresh={loadGoogleUsage}
              onBack={wizard.handleGoBack}
            />
          ) : wizard.wizardStep === 'audio-known' ? (
            <AudioStep
              list={selectedList}
              items={currentAudioItems}
              audioSide="known"
              title={t('lists.audioKnown')}
              googleUsage={googleUsage}
              onComplete={wizard.handleKnownAudioComplete}
              onSkip={wizard.handleKnownAudioComplete}
              onUsageRefresh={loadGoogleUsage}
              onBack={wizard.handleGoBack}
            />
          ) : null}
        </div>
      </div>

      {!sidebarOpen && (
        <button
          type="button"
          className="fixed right-4 bottom-4 z-20 rounded-full bg-accent text-background px-4 py-2.5 text-sm font-medium shadow-lg md:hidden"
          onClick={() => {
            setOpenCreateSignal((prev) => prev + 1);
            setSidebarOpen(true);
          }}
        >
          + {t('lists.newList')}
        </button>
      )}

      {pendingFork && (
        <PendingForkDialog
          pendingFork={pendingFork}
          forkingListId={forkingListId}
          languageOptions={languageOptions}
          onChange={(updater) => setPendingFork((current) => (current ? updater(current) : current))}
          onModelChange={handlePendingForkModelChange}
          onCancel={() => setPendingFork(null)}
          onConfirm={handleConfirmFork}
          onError={(message) => {
            setForkingListId(null);
            setError(message);
          }}
        />
      )}
    </div>
  );
}
