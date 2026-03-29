'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getDeviceId } from '@/lib/device-id';
import { ListSidebar } from './ListSidebar';
import { CategoryBrowser } from './CategoryBrowser';
import { TextareaEditor } from './TextareaEditor';
import { DiffPreview } from './DiffPreview';
import { TranslationStep } from './TranslationStep';
import { AudioStep } from './AudioStep';
import { ApiKeySettings } from './ApiKeySettings';

export type WordList = {
  id: string;
  ownerId: string | null;
  name: string;
  description: string | null;
  languageFrom: string;
  languageTo: string;
  isPublic: boolean;
};

export type WordCategory = {
  id: string;
  listId: string;
  name: string;
  position: number;
  isSystem: boolean;
};

export type WordListItem = {
  id: string;
  listId: string;
  categoryId: string | null;
  position: number;
  textKnown: string;
  textTarget: string | null;
  translationStatus: string;
  audioStatus: string;
  notes: string | null;
};

export type DiffResult = {
  added: string[];
  removed: { id: string; text_known: string; text_target: string | null }[];
  reordered: { id: string; text: string; from_pos: number; to_pos: number }[];
  unchanged: number;
  warning?: string;
};

export type ConfirmResult = {
  completed: boolean;
  needs_translation: boolean;
  pending_items?: { id: string; text_known: string; text_target: string | null; position: number }[];
};

type WizardStep = 'browse' | 'edit' | 'preview' | 'translate' | 'audio';

function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': getDeviceId(),
      ...options.headers,
    },
  });
}

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

  const selectedList = useMemo(
    () => lists.find((l) => l.id === selectedListId) ?? null,
    [lists, selectedListId]
  );

  const isOwner = useMemo(() => {
    if (!selectedList) return false;
    return selectedList.ownerId !== null;
  }, [selectedList]);

  // Fetch lists and subscription status on mount
  useEffect(() => {
    async function loadLists() {
      try {
        const res = await apiFetch('/api/lists');
        if (!res.ok) throw new Error('Failed to load lists');
        const data = await res.json();
        setLists(data.lists);
        if (data.lists.length > 0 && !selectedListId) {
          const owned = data.lists.find((l: WordList) => l.ownerId !== null);
          setSelectedListId(owned?.id ?? data.lists[0].id);
        }
        // Check subscription status for public lists
        const publicLists = data.lists.filter((l: WordList) => l.ownerId === null && l.isPublic);
        const subIds = new Set<string>();
        await Promise.all(
          publicLists.map(async (l: WordList) => {
            const subRes = await apiFetch(`/api/lists/${l.id}/subscribe`);
            if (subRes.ok) {
              const subData = await subRes.json();
              if (subData.subscribed) subIds.add(l.id);
            }
          })
        );
        setSubscribedListIds(subIds);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load lists');
      } finally {
        setLoading(false);
      }
    }
    loadLists();
  }, []);

  // Fetch list details when selected list changes
  useEffect(() => {
    if (!selectedListId) return;
    async function loadListDetails() {
      try {
        const res = await apiFetch(`/api/lists/${selectedListId}`);
        if (!res.ok) throw new Error('Failed to load list details');
        const data = await res.json();
        setCategories(data.categories ?? []);
        setItems(data.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load list');
      }
    }
    loadListDetails();
    setWizardStep('browse');
    setEditingCategoryId(null);
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
    const res = await apiFetch('/api/lists', {
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
      const res = await apiFetch(`/api/lists/${listId}`, { method: 'DELETE' });
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
      const res = await apiFetch(`/api/lists/${listId}/subscribe`, { method: 'POST' });
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
      const res = await apiFetch(`/api/lists/${listId}/subscribe`, { method: 'DELETE' });
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
    setWizardStep('edit');
  }, []);

  const handlePreview = useCallback(async (lines: string[]) => {
    if (!selectedListId || !editingCategoryId) return;
    const res = await apiFetch(
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
    const res = await apiFetch(
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
      // No new items — offer editing existing translations and audio for this category
      const categoryItems = editingCategoryId ? itemsByCategory.get(editingCategoryId) ?? [] : [];
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
        await reloadListDetails();
        setWizardStep('browse');
      }
    }
  }, [selectedListId, editingCategoryId, diffResult, editInputLanguage, itemsByCategory]);

  const handleTranslationComplete = useCallback(async () => {
    // Audio step is stubbed for now — go to audio stub then back to browse
    setWizardStep('audio');
  }, []);

  const handleAudioComplete = useCallback(async () => {
    await reloadListDetails();
    setWizardStep('browse');
    setEditingCategoryId(null);
    setPendingItems([]);
    setDiffResult(null);
  }, [selectedListId]);

  const handleSkipTranslation = useCallback(async () => {
    await reloadListDetails();
    setWizardStep('browse');
    setEditingCategoryId(null);
  }, [selectedListId]);

  async function reloadListDetails() {
    if (!selectedListId) return;
    const res = await apiFetch(`/api/lists/${selectedListId}`);
    if (res.ok) {
      const data = await res.json();
      setCategories(data.categories ?? []);
      setItems(data.items ?? []);
    }
  }

  const handleCancelWizard = useCallback(() => {
    setWizardStep('browse');
    setEditingCategoryId(null);
    setDiffResult(null);
    setPendingItems([]);
    setTranslateHeading('Translate Words');
  }, []);

  const handleCreateCategory = useCallback(async (name: string) => {
    if (!selectedListId) return;
    const res = await apiFetch(`/api/lists/${selectedListId}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Failed to create category');
    await reloadListDetails();
  }, [selectedListId]);

  const handleReorderCategories = useCallback(async (orderedIds: string[]) => {
    if (!selectedListId) return;
    await apiFetch(`/api/lists/${selectedListId}/categories`, {
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

  const handleDeleteCategory = useCallback(async (categoryId: string) => {
    if (!selectedListId) return;
    await apiFetch(`/api/lists/${selectedListId}/categories/${categoryId}`, {
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
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-current">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4zM3 10a7 7 0 1114 0 7 7 0 01-14 0z" stroke="currentColor" strokeWidth="1.5" fill="none" />
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
      <div className="flex-1 min-w-0 overflow-y-auto">
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
          />
        ) : wizardStep === 'preview' ? (
          <DiffPreview
            diff={diffResult!}
            existingItems={editingItems}
            onConfirm={handleConfirm}
            onCancel={handleCancelWizard}
          />
        ) : wizardStep === 'translate' ? (
          <TranslationStep
            list={selectedList}
            pendingItems={pendingItems ?? []}
            inputLanguage={editInputLanguage}
            heading={translateHeading}
            onComplete={handleTranslationComplete}
            onSkip={handleSkipTranslation}
          />
        ) : wizardStep === 'audio' ? (
          <AudioStep
            list={selectedList}
            items={editingCategoryId ? itemsByCategory.get(editingCategoryId) ?? [] : items}
            onComplete={handleAudioComplete}
            onSkip={handleAudioComplete}
          />
        ) : null}
      </div>

      {!sidebarOpen && (
        <button
          type="button"
          className="fixed bottom-4 right-4 z-20 rounded-full bg-accent text-background px-4 py-2.5 text-sm font-medium shadow-lg md:hidden"
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
