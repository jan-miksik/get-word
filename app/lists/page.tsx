'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { listsApiFetch } from '@/features/lists/api';
import type {
  ConfirmResult,
  DiffResult,
  GoogleUsageResponse,
  WordCategory,
  WordList,
  WordListItem,
} from '@/features/lists/types';
import { ListSidebar } from './ListSidebar';
import { CategoryBrowser } from './CategoryBrowser';
import { TextareaEditor } from './TextareaEditor';
import { DiffPreview } from './DiffPreview';
import { TranslationStep } from './TranslationStep';
import { AudioStep } from './AudioStep';
import { ApiKeySettings } from './ApiKeySettings';
import { WizardProgressBar } from './WizardProgressBar';

type WizardStep = 'browse' | 'edit' | 'preview' | 'translate' | 'audio';
type WizardActiveStep = 'edit' | 'preview' | 'translate' | 'audio';

export default function ListsPage() {
  const [lists, setLists] = useState<WordList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [categories, setCategories] = useState<WordCategory[]>([]);
  const [items, setItems] = useState<WordListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>('browse');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editInputLanguage, setEditInputLanguage] = useState<'known' | 'target'>('known');
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [pendingItems, setPendingItems] = useState<ConfirmResult['pending_items']>([]);
  const [translateHeading, setTranslateHeading] = useState('Translate Words');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subscribedListIds, setSubscribedListIds] = useState<Set<string>>(new Set());
  const [openCreateSignal, setOpenCreateSignal] = useState(0);
  const [isEditDirty, setIsEditDirty] = useState(false);
  const [googleUsage, setGoogleUsage] = useState<GoogleUsageResponse | null>(null);

  const selectedList = useMemo(
    () => lists.find((l) => l.id === selectedListId) ?? null,
    [lists, selectedListId]
  );

  const isOwner = useMemo(() => {
    if (!selectedList) return false;
    return selectedList.ownerId !== null;
  }, [selectedList]);

  const loadGoogleUsage = useCallback(async () => {
    try {
      const res = await listsApiFetch('/api/google-usage');
      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error('Failed to load Google API usage');
      }
      const data = await res.json();
      setGoogleUsage(data);
    } catch (err) {
      console.warn('[Wordlink lists] Could not load Google API usage', err);
    }
  }, []);

  // Fetch lists and subscription status on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('openrouter')) {
      setSettingsOpen(true);
    }
  }, []);

  useEffect(() => {
    async function loadLists() {
      try {
        void loadGoogleUsage();
        const res = await listsApiFetch('/api/lists');
        if (!res.ok) throw new Error('Failed to load lists');
        const data = await res.json();
        setLists(data.lists);
        setSelectedListId((current) => {
          if (current || data.lists.length === 0) return current;
          const owned = data.lists.find((l: WordList) => l.ownerId !== null);
          return owned?.id ?? data.lists[0].id;
        });
        setSubscribedListIds(new Set<string>(data.subscribedListIds ?? []));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load lists');
      } finally {
        setLoading(false);
      }
    }
    loadLists();
  }, [loadGoogleUsage]);

  // Fetch list details when selected list changes
  useEffect(() => {
    if (!selectedListId) return;
    const controller = new AbortController();
    async function loadListDetails() {
      try {
        const res = await listsApiFetch(`/api/lists/${selectedListId}?include_media=false`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Failed to load list details');
        const data = await res.json();
        setCategories(data.categories ?? []);
        setItems(data.items ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load list');
      }
    }
    loadListDetails();
    setWizardStep('browse');
    setEditingCategoryId(null);
    return () => controller.abort();
  }, [selectedListId]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, WordListItem[]>();
    for (const item of items) {
      const catId = item.categoryId ?? 'uncategorized';
      const existing = map.get(catId) ?? [];
      existing.push(item);
      map.set(catId, existing);
    }
    return map;
  }, [items]);

  const handleSelectList = useCallback((listId: string) => {
    setSelectedListId(listId);
    setSidebarOpen(false);
  }, []);

  const handleCreateList = useCallback(async (name: string, langFrom: string, langTo: string) => {
    const res = await listsApiFetch('/api/lists', {
      method: 'POST',
      body: JSON.stringify({ name, language_from: langFrom, language_to: langTo }),
    });
    if (!res.ok) throw new Error('Failed to create list');
    const data = await res.json();
    setLists((prev) => [...prev, data.list]);
    setSelectedListId(data.list.id);
  }, []);

  const handleDeleteList = useCallback(async (listId: string) => {
    try {
      const res = await listsApiFetch(`/api/lists/${listId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Delete failed');
      }

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
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, []);

  const handleSubscribe = useCallback(async (listId: string) => {
    try {
      const res = await listsApiFetch(`/api/lists/${listId}/subscribe`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Subscribe failed');
      }
      setSubscribedListIds((prev) => new Set([...prev, listId]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscribe failed');
    }
  }, []);

  const handleUnsubscribe = useCallback(async (listId: string) => {
    try {
      const res = await listsApiFetch(`/api/lists/${listId}/subscribe`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Unsubscribe failed');
      }
      setSubscribedListIds((prev) => {
        const next = new Set(prev);
        next.delete(listId);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unsubscribe failed');
    }
  }, []);

  const handleEditCategory = useCallback((categoryId: string, inputLang: 'known' | 'target') => {
    setEditingCategoryId(categoryId);
    setEditInputLanguage(inputLang);
    setIsEditDirty(false);
    setWizardStep('edit');
  }, []);

  const handlePreview = useCallback(async (lines: string[]) => {
    if (!selectedListId || !editingCategoryId) return;
    const res = await listsApiFetch(
      `/api/lists/${selectedListId}/categories/${editingCategoryId}/items/preview`,
      {
        method: 'PUT',
        body: JSON.stringify({ lines, input_language: editInputLanguage }),
      }
    );
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? 'Preview failed');
    }
    const diff = await res.json();
    setDiffResult(diff);
    setWizardStep('preview');
  }, [selectedListId, editingCategoryId, editInputLanguage]);

  const handleConfirm = useCallback(async () => {
    if (!selectedListId || !editingCategoryId || !diffResult) return;
    const res = await listsApiFetch(
      `/api/lists/${selectedListId}/categories/${editingCategoryId}/items/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({
          added: diffResult.added,
          removed: diffResult.removed,
          reordered: diffResult.reordered.map((r) => ({ id: r.id, position: r.to_pos })),
          input_language: editInputLanguage,
        }),
      }
    );
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? 'Confirm failed');
    }
    const result: ConfirmResult = await res.json();

    if (result.needs_translation && result.pending_items) {
      setTranslateHeading('Translate Words');
      setPendingItems(result.pending_items);
      setWizardStep('translate');
    } else {
      // Reload first so freshItems includes any just-confirmed new words
      const freshItems = await reloadListDetails();
      const categoryItems = editingCategoryId
        ? freshItems.filter((i) => i.categoryId === editingCategoryId)
        : [];
      if (categoryItems.length > 0) {
        setTranslateHeading('Review Translations & Audio');
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
  }, [selectedListId, editingCategoryId, diffResult, editInputLanguage, itemsByCategory]);

  const handleTranslationComplete = useCallback(async () => {
    await Promise.all([reloadListDetails({ includeMedia: true }), loadGoogleUsage()]);
    setWizardStep('audio');
  }, [loadGoogleUsage]);

  const handleAudioComplete = useCallback(async () => {
    await Promise.all([reloadListDetails(), loadGoogleUsage()]);
    setWizardStep('browse');
    setEditingCategoryId(null);
    setPendingItems([]);
    setDiffResult(null);
  }, [loadGoogleUsage, selectedListId]);

  const handleSkipTranslation = useCallback(async () => {
    await Promise.all([reloadListDetails(), loadGoogleUsage()]);
    setWizardStep('browse');
    setEditingCategoryId(null);
  }, [loadGoogleUsage, selectedListId]);

  async function reloadListDetails(options: { includeMedia?: boolean } = {}): Promise<WordListItem[]> {
    if (!selectedListId) return [];
    const includeMedia = options.includeMedia ?? false;
    const res = await listsApiFetch(
      `/api/lists/${selectedListId}?include_media=${includeMedia ? 'true' : 'false'}`
    );
    if (res.ok) {
      const data = await res.json();
      setCategories(data.categories ?? []);
      setItems(data.items ?? []);
      return data.items ?? [];
    }
    return [];
  }

  const handleCancelWizard = useCallback(() => {
    setWizardStep('browse');
    setEditingCategoryId(null);
    setDiffResult(null);
    setPendingItems([]);
    setTranslateHeading('Translate Words');
    setIsEditDirty(false);
  }, []);

  const handleGoBack = useCallback(() => {
    if (wizardStep === 'preview') setWizardStep('edit');
    else if (wizardStep === 'translate') setWizardStep('preview');
    else if (wizardStep === 'audio') setWizardStep('translate');
    else handleCancelWizard();
  }, [wizardStep, handleCancelWizard]);

  const handleGoToStep = useCallback(async (step: WizardActiveStep) => {
    const order: WizardActiveStep[] = ['edit', 'preview', 'translate', 'audio'];
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
      setTranslateHeading('Review Translations & Audio');
      setPendingItems(
        categoryItems.map((item) => ({
          id: item.id,
          text_known: item.textKnown,
          text_target: item.textTarget ?? null,
          position: item.position,
        })),
      );
    }

    if (step === 'audio') {
      await reloadListDetails({ includeMedia: true });
    }

    // From any non-edit step: allow jumping forward freely
    setWizardStep(step);
  }, [editingCategoryId, isEditDirty, itemsByCategory, wizardStep]);

  const handleCreateCategory = useCallback(async (name: string) => {
    if (!selectedListId) return;
    const res = await listsApiFetch(`/api/lists/${selectedListId}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Failed to create category');
    await reloadListDetails();
  }, [selectedListId]);

  const handleReorderCategories = useCallback(async (orderedIds: string[]) => {
    if (!selectedListId) return;
    await listsApiFetch(`/api/lists/${selectedListId}/categories`, {
      method: 'PUT',
      body: JSON.stringify({ ordered_ids: orderedIds }),
    });
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
    const res = await listsApiFetch(`/api/lists/${selectedListId}/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Rename failed');
    }
    setCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, name } : c))
    );
  }, [selectedListId]);

  const handleDeleteCategory = useCallback(async (categoryId: string) => {
    if (!selectedListId) return;
    await listsApiFetch(`/api/lists/${selectedListId}/categories/${categoryId}`, {
      method: 'DELETE',
    });
    await reloadListDetails();
  }, [selectedListId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-text">
        <div className="text-text-soft">Loading lists...</div>
      </div>
    );
  }

  const editingCategory = categories.find((c) => c.id === editingCategoryId);
  const editingItems = editingCategoryId ? itemsByCategory.get(editingCategoryId) ?? [] : [];

  return (
    <div className="flex h-screen bg-background text-text overflow-hidden">
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-background-elevated border border-border-subtle md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
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
        aria-label="API key settings"
        title="API Keys"
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
          onSelectList={handleSelectList}
          onCreateList={handleCreateList}
          onDeleteList={handleDeleteList}
          onSubscribe={handleSubscribe}
          onUnsubscribe={handleUnsubscribe}
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
          />
        )}

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 m-4 rounded-lg bg-danger/10 text-danger text-sm">
              {error}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {!selectedList ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-soft">Select a list to get started</p>
            </div>
          ) : wizardStep === 'browse' ? (
            <CategoryBrowser
              list={selectedList}
              categories={categories}
              itemsByCategory={itemsByCategory}
              isOwner={isOwner}
              onEditCategory={handleEditCategory}
              onCreateCategory={handleCreateCategory}
              onRenameCategory={handleRenameCategory}
              onReorderCategories={handleReorderCategories}
              onDeleteCategory={handleDeleteCategory}
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
              heading={translateHeading}
              googleUsage={googleUsage}
              onComplete={handleTranslationComplete}
              onSkip={handleSkipTranslation}
              onUsageRefresh={loadGoogleUsage}
              onBack={handleGoBack}
            />
          ) : wizardStep === 'audio' ? (
            <AudioStep
              list={selectedList}
              items={editingCategoryId ? itemsByCategory.get(editingCategoryId) ?? [] : items}
              googleUsage={googleUsage}
              onComplete={handleAudioComplete}
              onSkip={handleAudioComplete}
              onUsageRefresh={loadGoogleUsage}
              onBack={handleGoBack}
            />
          ) : null}
        </div>
      </div>

      {!sidebarOpen && (
        <button
          type="button"
          className="fixed right-4 z-20 rounded-full bg-accent text-background px-4 py-2.5 text-sm font-medium shadow-lg md:hidden bottom-[calc(1rem+var(--pwa-install-banner-offset,0px))]"
          onClick={() => {
            setOpenCreateSignal((prev) => prev + 1);
            setSidebarOpen(true);
          }}
        >
          + New List
        </button>
      )}
    </div>
  );
}
