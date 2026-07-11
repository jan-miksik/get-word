'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { SupportButton } from '@/components/SupportButton';
import {
  consumeOneShotListsUrlParams,
  readInitialListsUrlState,
  selectedListUrl,
} from '@/features/lists/client/url-state';
import { useLearningLanguages } from '@/features/lists/hooks/useLearningLanguages';
import { useListsSettingsLanguage } from '@/features/lists/hooks/useListsSettingsLanguage';
import { useGoogleUsage } from '@/features/lists/hooks/useGoogleUsage';
import { useListsPageData } from '@/features/lists/hooks/useListsPageData';
import { useListsDetailsData } from '@/features/lists/hooks/useListsDetailsData';
import { useListsForking } from '@/features/lists/hooks/useListsForking';
import { useListsPageActions } from '@/features/lists/hooks/useListsPageActions';
import { useListsWizard } from '@/features/lists/hooks/useListsWizard';
import { assignItemsCategory } from '@/features/lists/client/actions';
import { orderItemsByCategoryDisplay } from '@/features/lists/orderItems';
import { setAudioStorageLoggingEnabled } from '@/lib/audio-debug';
import type { WordListItem } from '@/features/lists/types';
import {
  clearPendingCommonListAudio,
  readPendingCommonListAudio,
} from '@/features/learning/onboarding/pendingCommonListAudio';
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

export default function ListsPage() {
  const settingsLanguage = useListsSettingsLanguage();

  return (
    <I18nProvider language={settingsLanguage}>
      <ListsPageContent />
      <SupportButton />
    </I18nProvider>
  );
}

function ListsPageContent() {
  const { t } = useI18n();
  const initialUrlState = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return readInitialListsUrlState(window.location.search);
  }, []);
  const [error, setError] = useState<string | null>(initialUrlState?.notice ?? null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(initialUrlState?.settingsOpen ?? false);
  const [openCreateSignal] = useState(initialUrlState?.shouldOpenCreate ? 1 : 0);
  const [initialCreateLanguageFrom] = useState<string | null>(
    initialUrlState?.initialCreateLanguageFrom ?? null,
  );
  const [initialCreateLanguageTo] = useState<string | null>(
    initialUrlState?.initialCreateLanguageTo ?? null,
  );
  const [existingListsHint, setExistingListsHint] = useState(initialUrlState?.existingListsHint ?? false);
  const [pendingAudioListId, setPendingAudioListId] = useState<string | null>(() =>
    readPendingCommonListAudio()?.listId ?? null,
  );
  const languages = useLearningLanguages();
  const { googleUsage, loadGoogleUsage } = useGoogleUsage();
  const {
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
  } = useListsPageData({
    initialSelectedListId: initialUrlState?.selectedListId,
    loadGoogleUsage,
    setError,
  });
  const markedLists = useMemo(
    () =>
      lists.map((list) => ({
        ...list,
        audioIncomplete: list.id === pendingAudioListId,
      })),
    [lists, pendingAudioListId],
  );
  const markedSelectedList = selectedList
    ? {
        ...selectedList,
        audioIncomplete: selectedList.id === pendingAudioListId,
      }
    : null;
  const [initialAudioFixStep, setInitialAudioFixStep] = useState<'audio-target' | 'audio-known' | null>(
    initialUrlState?.initialAudioFixStep ?? null,
  );
  const {
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
  } = useListsDetailsData({ selectedListId, setError });

  const updateSelectedListUrl = useCallback((
    listId: string,
    forkPrompt?: { sourceName: string } | null,
  ) => {
    if (typeof window === 'undefined') return;
    window.history.replaceState(null, '', selectedListUrl(listId, forkPrompt));
  }, []);
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);
  const {
    forkedListPrompt,
    pendingFork,
    forkingListId,
    forkProgress,
    clearForkedListPrompt,
    dismissForkNotice,
    startFork,
    updatePendingFork,
    changeForkModel,
    cancelFork,
    confirmFork,
    resetForking,
  } = useListsForking({
    lists,
    initialCreateLanguageFrom,
    initialCreateLanguageTo,
    initialForkedListPrompt: initialUrlState?.forkedListPrompt ?? null,
    beginDetailsTransition,
    addListAndSelect,
    updateSelectedListUrl,
    onForkSelected: closeSidebar,
  });

  // Consume one-shot URL params after initial state has been seeded from them.
  useEffect(() => {
    if (!initialUrlState) return;
    if (initialUrlState.initialAudioFixStep || initialUrlState.notice) {
      window.history.replaceState(null, '', consumeOneShotListsUrlParams(window.location.search));
    }
  }, [initialUrlState]);

  // Editor users keep audio storage source logging in the console off-localhost.
  useEffect(() => {
    setAudioStorageLoggingEnabled(canManageCommonLists);
  }, [canManageCommonLists]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPendingAudioListId(readPendingCommonListAudio()?.listId ?? null);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [selectedListId]);

  useEffect(() => {
    if (!pendingAudioListId || selectedListId !== pendingAudioListId || items.length === 0) return;
    const hasAudio = (url: string | null | undefined, urls: string[] | undefined) =>
      Boolean(url) || Boolean(urls?.some(Boolean));
    const hasMissingAudio = items.some(
      (item) =>
        !hasAudio(item.knownAudioUrl, item.knownAudioArweaveUrls) ||
        !hasAudio(item.audioUrl, item.audioArweaveUrls),
    );
    if (hasMissingAudio) return;
    clearPendingCommonListAudio(pendingAudioListId);
    const timeoutId = window.setTimeout(() => setPendingAudioListId(null), 0);
    return () => window.clearTimeout(timeoutId);
  }, [items, pendingAudioListId, selectedListId]);

  const wizard = useListsWizard({
    selectedListId,
    items,
    categories,
    itemsByCategory,
    reloadListDetails,
    loadGoogleUsage,
  });

  const handleSidesCleared = useCallback((clearedSides: ('known' | 'target')[], freshItems: WordListItem[]) => {
    wizard.startAllWordsReviewAfterSideClear(clearedSides, freshItems);
  }, [wizard]);

  // Persist a single item's category from the review step's ⋮ menu. Throws on
  // failure so the step can revert its optimistic update. Page-level `items`
  // refresh naturally on step exit, so no mid-step reload here.
  const handleAssignItemCategory = useCallback(
    async (itemId: string, categoryId: string) => {
      if (!selectedListId) return;
      await assignItemsCategory(selectedListId, [itemId], categoryId);
    },
    [selectedListId],
  );

  const {
    selectList,
    createList,
    updateList,
    editList,
  } = useListsPageActions({
    selectedListId,
    setSelectedListId,
    beginDetailsTransition,
    clearForkedListPrompt,
    updateSelectedListUrl,
    addListAndSelect,
    applyUpdatedList,
    reloadListDetails,
    onListEdit: () => {
      wizard.triggerEdit();
      closeSidebar();
    },
    onListSelected: closeSidebar,
    onListSidesCleared: handleSidesCleared,
    forkedListPrompt,
  });

  // Fetch list details when selected list changes.
  useEffect(() => {
    if (!selectedListId) return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void loadSelectedListDetails({
        signal: controller.signal,
        onLoaded: (freshItems) => {
          if (initialAudioFixStep) {
            wizard.openAudioStepFromFix(freshItems, initialAudioFixStep);
            setInitialAudioFixStep(null);
          } else {
            wizard.showBrowse();
          }
        },
      });
    }, 0);
    wizard.resetForListChange();
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAudioFixStep, loadSelectedListDetails, selectedListId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-text">
        <div className="text-text-soft">{t('common.loadingLists')}</div>
      </div>
    );
  }

  const editingCategory = categories.find((c) => c.id === wizard.editingCategoryId);
  const editingItems = wizard.editingCategoryId ? itemsByCategory.get(wizard.editingCategoryId) ?? [] : [];
  const currentAudioItems =
    wizard.audioStepItems ??
    (wizard.editingCategoryId ? editingItems : orderItemsByCategoryDisplay(items, categories));
  const languageOptions = languages.length > 0 ? languages : [
    { code: 'cs', name: t('languageName.cs') },
    { code: 'vi', name: t('languageName.vi') },
    { code: 'en', name: t('languageName.en') },
  ];

  return (
    <div className="flex h-screen bg-background text-text overflow-hidden overscroll-none">
      <ApiKeySettings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-40 w-72 border-r border-border-subtle bg-background-elevated
        transform transition-transform duration-200
        md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <ListSidebar
          lists={markedLists}
          selectedListId={selectedListId}
          subscribedListIds={subscribedListIds}
          googleUsage={googleUsage}
          languages={languages}
          canManageCommonLists={canManageCommonLists}
          initialCreateLanguageFrom={initialCreateLanguageFrom}
          initialCreateLanguageTo={initialCreateLanguageTo}
          onSelectList={selectList}
          onCreateList={createList}
          onDeleteList={deleteList}
          onEditList={editList}
          onSubscribe={subscribeToList}
          onUnsubscribe={unsubscribeFromList}
          onFork={startFork}
          onListUpdated={applyUpdatedList}
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
        {/* Top bar (static at top, not fixed) */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-background-elevated">
          <button
            type="button"
            className="md:hidden -ml-1 p-2 rounded-lg text-text hover:bg-background/60 transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={t('lists.toggleSidebar')}
          >
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" className="text-current">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          <div className="flex-1" />

          <button
            type="button"
            className="p-2 rounded-lg text-text-soft hover:text-text hover:bg-background/60 transition-colors"
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
        </div>

        {wizard.wizardStep !== 'browse' && markedSelectedList && (
          <WizardProgressBar
            currentStep={wizard.wizardStep as WizardActiveStep}
            onGoToStep={wizard.handleGoToStep}
            canJumpForward={!wizard.isEditDirty}
            availableSteps={wizard.editingAllWords ? ['translate', 'audio-target', 'audio-known'] : undefined}
          />
        )}

        <div className="flex-1 overflow-y-auto overscroll-y-contain">
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

          {!markedSelectedList ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-soft">{t('lists.startBySelecting')}</p>
            </div>
          ) : loadingDetails ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-soft">{t('app.loading')}</p>
            </div>
          ) : wizard.wizardStep === 'browse' ? (
            <CategoryBrowser
              list={markedSelectedList}
              categories={categories}
              itemsByCategory={itemsByCategory}
              languages={languages}
              isOwner={isOwner}
              isEditor={canManageCommonLists}
              forkedFromListName={forkedListPrompt?.listId === markedSelectedList.id ? forkedListPrompt.sourceName : null}
              triggerEditSignal={wizard.triggerEditSignal}
              onEditCategory={wizard.handleEditCategory}
              onEditAllWords={wizard.handleEditAllWords}
              onCreateCategory={createCategory}
              onUpdateList={updateList}
              onDismissForkNotice={dismissForkNotice}
              onRenameCategory={renameCategory}
              onReorderCategories={reorderCategories}
              onDeleteCategory={deleteCategory}
              onFork={startFork}
              onDeleteList={deleteList}
              onListUpdated={applyUpdatedList}
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
              list={markedSelectedList}
              pendingItems={wizard.pendingItems ?? []}
              newItemIds={wizard.newPendingItemIds}
              inputLanguage={wizard.editInputLanguage}
              heading={t(
                wizard.translateHeadingMode === 'review'
                  ? 'lists.reviewTranslationsAndAudio'
                  : 'lists.translateWords',
              )}
              googleUsage={googleUsage}
              onInputLanguageChange={wizard.setEditInputLanguage}
              onComplete={wizard.handleTranslationComplete}
              onSkip={wizard.handleSkipTranslation}
              onUsageRefresh={loadGoogleUsage}
              onBack={wizard.handleGoBack}
              onRemoveItem={wizard.markItemRemoved}
              categories={categories}
              onAssignCategory={handleAssignItemCategory}
            />
          ) : wizard.wizardStep === 'audio-target' ? (
            <AudioStep
              list={markedSelectedList}
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
              list={markedSelectedList}
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

      {pendingFork && (
        <PendingForkDialog
          pendingFork={pendingFork}
          forkingListId={forkingListId}
          forkProgress={forkProgress}
          languageOptions={languageOptions}
          onChange={updatePendingFork}
          onModelChange={changeForkModel}
          onCancel={cancelFork}
          onConfirm={confirmFork}
          onError={(message) => {
            resetForking();
            setError(message);
          }}
        />
      )}
    </div>
  );
}
