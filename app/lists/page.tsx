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
import { useBuildAudioStepItems, useItemsByCategory } from '@/features/lists/hooks/useListWizardItems';
import type {
  CompletedTranslationRow,
  ConfirmResult,
  DiffResult,
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

type WizardStep = 'browse' | WizardActiveStep;
type ForkedListPrompt = { listId: string; sourceName: string };
type PendingListItems = NonNullable<ConfirmResult['pending_items']>;
type TranslateHeadingMode = 'translate' | 'review';

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

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>('browse');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingAllWords, setEditingAllWords] = useState(false);
  const [editInputLanguage, setEditInputLanguage] = useState<'known' | 'target'>('known');
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingListItems>([]);
  const [audioStepItems, setAudioStepItems] = useState<WordListItem[] | null>(null);
  const [translateHeadingMode, setTranslateHeadingMode] = useState<TranslateHeadingMode>('translate');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subscribedListIds, setSubscribedListIds] = useState<Set<string>>(new Set());
  const [openCreateSignal, setOpenCreateSignal] = useState(0);
  const [initialCreateLanguageFrom, setInitialCreateLanguageFrom] = useState<string | null>(null);
  const [initialCreateLanguageTo, setInitialCreateLanguageTo] = useState<string | null>(null);
  const [existingListsHint, setExistingListsHint] = useState(false);
  const languages = useLearningLanguages();
  const [isEditDirty, setIsEditDirty] = useState(false);
  const [googleUsage, setGoogleUsage] = useState<GoogleUsageResponse | null>(null);
  const [forkedListPrompt, setForkedListPrompt] = useState<ForkedListPrompt | null>(null);
  const [canManageCommonLists, setCanManageCommonLists] = useState(false);
  const [initialAudioFixStep, setInitialAudioFixStep] = useState<'audio-target' | 'audio-known' | null>(null);
  const [triggerEditSignal, setTriggerEditSignal] = useState(0);
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

  // Fetch list details when selected list changes
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
          setAudioStepItems(freshItems);
          setWizardStep(initialAudioFixStep);
          setInitialAudioFixStep(null);
        } else {
          setWizardStep('browse');
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
    setEditingCategoryId(null);
    setEditingAllWords(false);
    return () => controller.abort();
  }, [initialAudioFixStep, selectedListId, t]);

  const itemsByCategory = useItemsByCategory(items);
  const buildAudioStepItems = useBuildAudioStepItems({
    editingCategoryId,
    pendingItems,
    selectedListId,
  });

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
      setEditingCategoryId(null);
      setEditingAllWords(true);
      setAudioStepItems(null);
      setDiffResult(null);
      setEditInputLanguage(clearedSides.includes('target') ? 'known' : 'target');
      setTranslateHeadingMode('translate');
      setPendingItems(
        freshItems.map((item) => ({
          id: item.id,
          text_known: item.textKnown,
          text_target: item.textTarget ?? null,
          position: item.position,
        })),
      );
      setWizardStep('translate');
    }
  }, [forkedListPrompt, selectedListId, updateSelectedListUrl]);

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
    setTriggerEditSignal((s) => s + 1);
    setSidebarOpen(false);
  }, []);

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

  const handleEditCategory = useCallback((categoryId: string, inputLang: 'known' | 'target') => {
    setEditingCategoryId(categoryId);
    setEditingAllWords(false);
    setEditInputLanguage(inputLang);
    setAudioStepItems(null);
    setIsEditDirty(false);
    setWizardStep('edit');
  }, []);

  const handleEditAllWords = useCallback(() => {
    setEditingCategoryId(null);
    setEditingAllWords(true);
    setEditInputLanguage('known');
    setAudioStepItems(null);
    setDiffResult({
      added: [],
      removed: [],
      reordered: [],
      unchanged: items.length,
    });
    setTranslateHeadingMode('review');
    setPendingItems(
      items.map((item) => ({
        id: item.id,
        text_known: item.textKnown,
        text_target: item.textTarget ?? null,
        position: item.position,
      })),
    );
    setIsEditDirty(false);
    setWizardStep('translate');
  }, [items]);

  const handlePreview = useCallback(async (lines: string[]) => {
    if (!selectedListId || !editingCategoryId) return;
    const diff = await listActions.previewCategoryItems(
      selectedListId,
      editingCategoryId,
      lines,
      editInputLanguage,
    );
    setDiffResult(diff);
    setWizardStep('preview');
  }, [selectedListId, editingCategoryId, editInputLanguage]);

  const handleConfirm = useCallback(async () => {
    if (!selectedListId || !editingCategoryId || !diffResult) return;
    setAudioStepItems(null);
    const result = await listActions.confirmCategoryItems(
      selectedListId,
      editingCategoryId,
      diffResult,
      editInputLanguage,
    );

    if (result.needs_translation && result.pending_items) {
      setTranslateHeadingMode('translate');
      setPendingItems(result.pending_items);
      setWizardStep('translate');
    } else {
      // Reload first so freshItems includes any just-confirmed new words
      const freshItems = await reloadListDetails();
      const categoryItems = editingCategoryId
        ? freshItems.filter((i) => i.categoryId === editingCategoryId)
        : [];
      if (categoryItems.length > 0) {
        setTranslateHeadingMode('review');
        setPendingItems(
          categoryItems.map((item) => ({
            id: item.id,
            text_known: item.textKnown,
            text_target: item.textTarget ?? null,
            position: item.position,
          }))
        );
        setWizardStep('translate');
      } else {
        setWizardStep('browse');
      }
    }
  }, [selectedListId, editingCategoryId, diffResult, editInputLanguage]);

  const handleTranslationComplete = useCallback(async (translationRows: CompletedTranslationRow[]) => {
    const [freshItems] = await Promise.all([
      reloadListDetails({ includeMedia: true }),
      loadGoogleUsage(),
    ]);
    setPendingItems(translationRows.map((row, index) => ({
      id: row.id,
      text_known: row.textKnown,
      text_target: row.textTarget || null,
      position: pendingItems?.find((item) => item.id === row.id)?.position ?? index,
    })));
    setAudioStepItems(buildAudioStepItems(freshItems, translationRows));
    setWizardStep('audio-target');
  }, [buildAudioStepItems, loadGoogleUsage, pendingItems]);

  const handleTargetAudioComplete = useCallback(async () => {
    const [freshItems] = await Promise.all([
      reloadListDetails({ includeMedia: true }),
      loadGoogleUsage(),
    ]);
    setAudioStepItems(buildAudioStepItems(freshItems));
    setWizardStep('audio-known');
  }, [buildAudioStepItems, loadGoogleUsage]);

  const handleKnownAudioComplete = useCallback(async () => {
    await Promise.all([reloadListDetails(), loadGoogleUsage()]);
    setWizardStep('browse');
    setEditingCategoryId(null);
    setEditingAllWords(false);
    setPendingItems([]);
    setAudioStepItems(null);
    setDiffResult(null);
  }, [loadGoogleUsage]);

  const handleSkipTranslation = useCallback(async () => {
    if (editingAllWords) {
      const [freshItems] = await Promise.all([
        reloadListDetails({ includeMedia: true }),
        loadGoogleUsage(),
      ]);
      setAudioStepItems(buildAudioStepItems(freshItems));
      setWizardStep('audio-target');
      return;
    }

    await Promise.all([reloadListDetails(), loadGoogleUsage()]);
    setWizardStep('browse');
    setEditingCategoryId(null);
    setEditingAllWords(false);
    setAudioStepItems(null);
  }, [buildAudioStepItems, editingAllWords, loadGoogleUsage]);

  async function reloadListDetails(options: { includeMedia?: boolean } = {}): Promise<WordListItem[]> {
    if (!selectedListId) return [];
    const details = await listActions.fetchListDetails(selectedListId, {
      includeMedia: options.includeMedia ?? false,
    });
    setCategories(details.categories);
    setItems(details.items);
    return details.items;
  }

  const handleCancelWizard = useCallback(() => {
    setWizardStep('browse');
    setEditingCategoryId(null);
    setEditingAllWords(false);
    setDiffResult(null);
    setPendingItems([]);
    setAudioStepItems(null);
    setTranslateHeadingMode('translate');
    setIsEditDirty(false);
  }, []);

  const handleGoBack = useCallback(() => {
    if (editingAllWords && wizardStep === 'translate') handleCancelWizard();
    else if (wizardStep === 'preview') setWizardStep('edit');
    else if (wizardStep === 'translate') setWizardStep('preview');
    else if (wizardStep === 'audio-target') setWizardStep('translate');
    else if (wizardStep === 'audio-known') setWizardStep('audio-target');
    else handleCancelWizard();
  }, [editingAllWords, wizardStep, handleCancelWizard]);

  const handleGoToStep = useCallback(async (step: WizardActiveStep) => {
    const order: WizardActiveStep[] = ['edit', 'preview', 'translate', 'audio-target', 'audio-known'];
    if (editingAllWords && (step === 'edit' || step === 'preview')) return;
    const currentIdx = order.indexOf(wizardStep as WizardActiveStep);
    const targetIdx = order.indexOf(step);

    // Always allow going back
    if (targetIdx <= currentIdx) {
      setWizardStep(step);
      return;
    }

    // Blocked if currently editing with unsaved changes
    if (isEditDirty) return;

    // From edit step: set up diff/pending so later steps have data
    if (wizardStep === 'edit' && editingCategoryId) {
      const categoryItems = itemsByCategory.get(editingCategoryId) ?? [];
      setDiffResult({
        added: [],
        removed: [],
        reordered: [],
        unchanged: categoryItems.length,
      });
      setTranslateHeadingMode('review');
      setPendingItems(
        categoryItems.map((item) => ({
          id: item.id,
          text_known: item.textKnown,
          text_target: item.textTarget ?? null,
          position: item.position,
        })),
      );
    }

    if (step === 'audio-target' || step === 'audio-known') {
      const freshItems = await reloadListDetails({ includeMedia: true });
      setAudioStepItems(buildAudioStepItems(freshItems));
    }

    // From any non-edit step: allow jumping forward freely
    setWizardStep(step);
  }, [buildAudioStepItems, editingAllWords, editingCategoryId, isEditDirty, itemsByCategory, wizardStep]);

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

  const editingCategory = categories.find((c) => c.id === editingCategoryId);
  const editingItems = editingCategoryId ? itemsByCategory.get(editingCategoryId) ?? [] : [];
  const currentAudioItems = audioStepItems ?? (editingCategoryId ? editingItems : items);
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
        {wizardStep !== 'browse' && selectedList && (
          <WizardProgressBar
            currentStep={wizardStep as WizardActiveStep}
            onGoToStep={handleGoToStep}
            canJumpForward={!isEditDirty}
            availableSteps={editingAllWords ? ['translate', 'audio-target', 'audio-known'] : undefined}
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
          ) : wizardStep === 'browse' ? (
            <CategoryBrowser
              list={selectedList}
              categories={categories}
              itemsByCategory={itemsByCategory}
              languages={languages}
              isOwner={isOwner}
              isEditor={canManageCommonLists}
              forkedFromListName={forkedListPrompt?.listId === selectedList.id ? forkedListPrompt.sourceName : null}
              triggerEditSignal={triggerEditSignal}
              onEditCategory={handleEditCategory}
              onEditAllWords={handleEditAllWords}
              onCreateCategory={handleCreateCategory}
              onUpdateList={handleUpdateList}
              onDismissForkNotice={handleDismissForkNotice}
              onRenameCategory={handleRenameCategory}
              onReorderCategories={handleReorderCategories}
              onDeleteCategory={handleDeleteCategory}
              onFork={handleForkList}
              onDeleteList={handleDeleteList}
            />
          ) : wizardStep === 'edit' ? (
            <TextareaEditor
              category={editingCategory!}
              items={editingItems}
              inputLanguage={editInputLanguage}
              onInputLanguageChange={setEditInputLanguage}
              onPreview={handlePreview}
              onCancel={handleCancelWizard}
              onDirtyChange={setIsEditDirty}
            />
          ) : wizardStep === 'preview' ? (
            <DiffPreview
              diff={diffResult!}
              existingItems={editingItems}
              onConfirm={handleConfirm}
              onCancel={handleCancelWizard}
              onBack={handleGoBack}
            />
          ) : wizardStep === 'translate' ? (
            <TranslationStep
              list={selectedList}
              pendingItems={pendingItems ?? []}
              inputLanguage={editInputLanguage}
              heading={t(
                translateHeadingMode === 'review'
                  ? 'lists.reviewTranslationsAndAudio'
                  : 'lists.translateWords',
              )}
              googleUsage={googleUsage}
              onComplete={handleTranslationComplete}
              onSkip={handleSkipTranslation}
              onUsageRefresh={loadGoogleUsage}
              onBack={handleGoBack}
            />
          ) : wizardStep === 'audio-target' ? (
            <AudioStep
              list={selectedList}
              items={currentAudioItems}
              audioSide="target"
              title={t('lists.audioTarget')}
              googleUsage={googleUsage}
              onComplete={handleTargetAudioComplete}
              onSkip={handleTargetAudioComplete}
              onUsageRefresh={loadGoogleUsage}
              onBack={handleGoBack}
            />
          ) : wizardStep === 'audio-known' ? (
            <AudioStep
              list={selectedList}
              items={currentAudioItems}
              audioSide="known"
              title={t('lists.audioKnown')}
              googleUsage={googleUsage}
              onComplete={handleKnownAudioComplete}
              onSkip={handleKnownAudioComplete}
              onUsageRefresh={loadGoogleUsage}
              onBack={handleGoBack}
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
