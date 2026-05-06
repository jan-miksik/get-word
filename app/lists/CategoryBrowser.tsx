'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { WordCategory, WordList, WordListItem } from '@/features/lists/types';
import { ConfirmModal } from '@/components/ConfirmModal';

interface CategoryBrowserProps {
  list: WordList;
  categories: WordCategory[];
  itemsByCategory: Map<string, WordListItem[]>;
  isOwner: boolean;
  isEditor: boolean;
  forkedFromListName?: string | null;
  triggerEditSignal?: number;
  onEditCategory: (categoryId: string, inputLang: 'known' | 'target') => void;
  onCreateCategory: (name: string) => Promise<void>;
  onUpdateList: (listId: string, data: Pick<WordList, 'name' | 'description' | 'isPublic'> & { isCommon?: boolean }) => Promise<void>;
  onDismissForkNotice?: () => void;
  onRenameCategory: (categoryId: string, name: string) => Promise<void>;
  onReorderCategories: (orderedIds: string[]) => Promise<void>;
  onDeleteCategory: (categoryId: string) => Promise<void>;
  onFork?: (listId: string) => Promise<void>;
  onDeleteList?: (listId: string) => Promise<void>;
}

function ForkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="5" r="2.25" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="6" r="2.25" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="19" r="2.25" stroke="currentColor" strokeWidth="2" />
      <path d="M6 7.25v9.5M8.25 5.75h4.5A5.25 5.25 0 0118 11v-2.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ListBadges({ list }: { list: WordList }) {
  return (
    <>
      {list.isCommon && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-fresh/10 text-fresh border border-fresh/20">
          Common seed
        </span>
      )}
      {list.isPublic && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-done/10 text-done border border-done/20">
          Public
        </span>
      )}
      {!list.isPublic && !list.isCommon && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-text-soft/10 text-text-soft border border-border-subtle">
          Non-Public
        </span>
      )}
    </>
  );
}

export function CategoryBrowser({
  list,
  categories,
  itemsByCategory,
  isOwner,
  isEditor,
  forkedFromListName,
  triggerEditSignal,
  onEditCategory,
  onCreateCategory,
  onUpdateList,
  onDismissForkNotice,
  onRenameCategory,
  onReorderCategories,
  onDeleteCategory,
  onFork,
  onDeleteList,
}: CategoryBrowserProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingList, setEditingList] = useState(false);
  const [listName, setListName] = useState(list.name);
  const [listDescription, setListDescription] = useState(list.description ?? '');
  const [listIsPublic, setListIsPublic] = useState(list.isPublic);
  const [listIsCommon, setListIsCommon] = useState(Boolean(list.isCommon));
  const [savingList, setSavingList] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState<WordCategory | null>(null);
  const [deleteListConfirm, setDeleteListConfirm] = useState(false);
  const [forkingList, setForkingList] = useState(false);
  const dragItemRef = useRef<string | null>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const canEditListMetadata = isOwner || isEditor;

  useEffect(() => {
    setEditingList(Boolean(forkedFromListName));
    setListName(forkedFromListName ? '' : list.name);
    setListDescription(forkedFromListName ? '' : list.description ?? '');
    setListIsPublic(list.isPublic);
    setListIsCommon(Boolean(list.isCommon));
    setSavingList(false);
  }, [forkedFromListName, list.id, list.name, list.description, list.isPublic, list.isCommon]);

  useEffect(() => {
    if (triggerEditSignal && triggerEditSignal > 0) {
      setEditingList(true);
    }
  }, [triggerEditSignal]);

  useEffect(() => {
    if (!headerMenuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setHeaderMenuOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [headerMenuOpen]);

  async function handleRenameSubmit(categoryId: string) {
    const trimmed = renameValue.trim();
    if (trimmed) {
      await onRenameCategory(categoryId, trimmed);
    }
    setRenamingId(null);
    setRenameValue('');
  }

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    await onCreateCategory(newCategoryName.trim());
    setNewCategoryName('');
    setShowAddCategory(false);
  }

  async function handleListMetadataSubmit() {
    const trimmedName = listName.trim();
    if (!trimmedName) return;

    setSavingList(true);
    try {
      await onUpdateList(list.id, {
        name: trimmedName,
        description: listDescription.trim() || null,
        isPublic: listIsCommon ? true : listIsPublic,
        ...(isEditor ? { isCommon: listIsCommon } : {}),
      });
      onDismissForkNotice?.();
      setEditingList(false);
    } finally {
      setSavingList(false);
    }
  }

  function cancelListMetadataEdit() {
    setListName(list.name);
    setListDescription(list.description ?? '');
    setListIsPublic(list.isPublic);
    setListIsCommon(Boolean(list.isCommon));
    setEditingList(false);
    onDismissForkNotice?.();
  }

  function handleDragStart(categoryId: string) {
    dragItemRef.current = categoryId;
  }

  function handleDragOver(e: React.DragEvent, categoryId: string) {
    e.preventDefault();
    setDragOverId(categoryId);
  }

  function handleDrop(targetId: string) {
    const dragId = dragItemRef.current;
    if (!dragId || dragId === targetId) {
      setDragOverId(null);
      return;
    }
    const ordered = categories.map((c) => c.id);
    const fromIdx = ordered.indexOf(dragId);
    const toIdx = ordered.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, dragId);
    onReorderCategories(ordered);
    setDragOverId(null);
    dragItemRef.current = null;
  }

  async function handleForkList() {
    if (!onFork) return;
    setHeaderMenuOpen(false);
    setForkingList(true);
    try {
      await onFork(list.id);
    } finally {
      setForkingList(false);
    }
  }

  async function handleDeleteListConfirmed() {
    if (!onDeleteList) return;
    setDeleteListConfirm(false);
    await onDeleteList(list.id);
  }

  const totalItems = countVisibleCategoryItems(itemsByCategory, categories);

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      {/* List header */}
      <div className="mb-6">
        {editingList ? (
          <div className="rounded-lg border border-border-subtle bg-background-elevated p-3 shadow-sm">
            <div className="grid gap-3">
              {forkedFromListName ? (
                <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                    Forked list
                  </p>
                  <p className="mt-1 text-sm text-text">
                    This copy was forked from {forkedFromListName}. Give it its own name and description before editing words.
                  </p>
                </div>
              ) : null}
              <label className="grid gap-1">
                <span className="text-xs font-medium text-text-soft">List name</span>
                <input
                  type="text"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  className="rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
                  placeholder={forkedFromListName ? 'Name your forked list' : undefined}
                  autoFocus
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-text-soft">Description</span>
                <textarea
                  value={listDescription}
                  onChange={(e) => setListDescription(e.target.value)}
                  rows={3}
                  className="resize-none rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
                  placeholder={forkedFromListName ? 'What this fork is good for' : 'What this list is good for'}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-text-soft">
                <input
                  type="checkbox"
                  checked={listIsPublic || listIsCommon}
                  disabled={listIsCommon}
                  onChange={(e) => setListIsPublic(e.target.checked)}
                  className="size-4 accent-accent"
                />
                Public list
              </label>
              {isEditor ? (
                <label className="flex items-start gap-2 rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-text-soft">
                  <input
                    type="checkbox"
                    checked={listIsCommon}
                    onChange={(e) => {
                      setListIsCommon(e.target.checked);
                      if (e.target.checked) setListIsPublic(true);
                    }}
                    className="mt-0.5 size-4 accent-accent"
                  />
                  <span>
                    <span className="block font-medium text-text">Use as common list seed</span>
                    <span className="block text-xs">
                      Autogenerate common list will fork and translate from this list.
                    </span>
                  </span>
                </label>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
                  disabled={savingList || !listName.trim()}
                  onClick={handleListMetadataSubmit}
                >
                  {savingList ? 'Saving...' : 'Save list'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-soft"
                  onClick={cancelListMetadataEdit}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-text">{list.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-soft">
                <span>{list.languageFrom} → {list.languageTo}</span>
                <ListBadges list={list} />
                <span className="basis-full sm:basis-auto">
                  {totalItems} words · {categories.length} categories
                </span>
              </div>
              {list.description && (
                <p className="text-sm text-text-soft mt-1">{list.description}</p>
              )}
            </div>

            <div className="hidden md:flex shrink-0 items-center gap-2">
              {canEditListMetadata ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background shadow-sm transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  onClick={() => setEditingList(true)}
                >
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className="text-current">
                    <path d="M11.5 4.5l4 4L7 17H3v-4L11.5 4.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M10 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  Edit list
                </button>
              ) : null}

              {/* Three-dots menu next to Edit list */}
              {(onFork || onDeleteList) && (
                <div className="relative" ref={headerMenuRef}>
                  <button
                    type="button"
                    className="p-2 rounded-lg border border-border-subtle text-text-soft hover:text-text hover:bg-background-elevated transition-colors"
                    onClick={() => setHeaderMenuOpen((prev) => !prev)}
                    disabled={forkingList}
                    aria-label="More options"
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <circle cx="10" cy="4" r="1.5" />
                      <circle cx="10" cy="10" r="1.5" />
                      <circle cx="10" cy="16" r="1.5" />
                    </svg>
                  </button>

                  {headerMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-lg border border-border-subtle bg-background shadow-lg py-1">
                      {onFork && (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-background-elevated transition-colors"
                          onClick={handleForkList}
                          disabled={forkingList}
                        >
                          <ForkIcon />
                          {forkingList ? 'Forking...' : 'Fork list'}
                        </button>
                      )}
                      {onDeleteList && (
                        <>
                          {onFork && <div className="my-1 border-t border-border-subtle" />}
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 transition-colors"
                            onClick={() => { setHeaderMenuOpen(false); setDeleteListConfirm(true); }}
                          >
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                              <path d="M4 6h12M8 3h4M7 6v10m6-10v10M6 6l.6 10.2A1 1 0 007.6 17h4.8a1 1 0 001-.8L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            Delete list
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile read-only banner */}
      <div className="md:hidden mb-4 p-3 rounded-lg bg-accent/10 border border-accent/20">
        <p className="text-sm text-accent">Edit your word list on desktop</p>
      </div>

      {/* Categories */}
      <div className="space-y-2">
        {categories.map((category) => {
          const catItems = itemsByCategory.get(category.id) ?? [];
          const isExpanded = expandedIds.has(category.id);
          const isDragOver = dragOverId === category.id;

          return (
            <div
              key={category.id}
              className={`rounded-lg border transition-colors ${
                isDragOver ? 'border-accent' : 'border-border-subtle'
              }`}
              draggable={isOwner}
              onDragStart={() => handleDragStart(category.id)}
              onDragOver={(e) => handleDragOver(e, category.id)}
              onDragEnd={() => setDragOverId(null)}
              onDrop={() => handleDrop(category.id)}
            >
              {/* Category header */}
              {renamingId === category.id ? (
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="flex-1 px-2 py-1 rounded-md bg-background border border-accent text-text text-sm focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleRenameSubmit(category.id);
                      if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
                    }}
                    onBlur={() => void handleRenameSubmit(category.id)}
                  />
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-md bg-accent text-background text-xs font-medium"
                    onMouseDown={(e) => { e.preventDefault(); void handleRenameSubmit(category.id); }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-md border border-border-subtle text-text-soft text-xs"
                    onMouseDown={(e) => { e.preventDefault(); setRenamingId(null); setRenameValue(''); }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-background-elevated/50 rounded-lg transition-colors"
                  onClick={() => toggleExpand(category.id)}
                >
                  {isOwner && (
                    <span className="cursor-grab text-text-soft text-xs select-none hidden md:inline">⠿</span>
                  )}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    className={`text-text-soft transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                  >
                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  </svg>
                  <span className="font-medium text-text text-sm flex-1 truncate">{category.name}</span>
                  <span className="text-xs text-text-soft">{catItems.length} words</span>
                </button>
              )}

              {/* Expanded word list */}
              {isExpanded && (
                <div className="px-4 pb-3 border-t border-border-subtle">
                  {/* Edit/Delete buttons - desktop only, owner only */}
                  {isOwner && (
                    <div className="py-2 hidden md:flex gap-2">
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditCategory(category.id, 'known');
                        }}
                      >
                        Edit words
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg border border-border-subtle text-text-soft text-xs hover:bg-background transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(category.id);
                          setRenameValue(category.name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg text-danger/70 text-xs hover:bg-danger/10 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteCategoryConfirm(category);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}

                  {catItems.length === 0 ? (
                    <p className="py-3 text-sm text-text-soft">No words in this category</p>
                  ) : (
                    <div className="divide-y divide-border-subtle">
                      {catItems.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 py-2 text-sm">
                          <span className="flex-1 text-text truncate">{item.textKnown}</span>
                          <span className="flex-1 text-text-soft truncate">
                            {item.textTarget ?? (
                              <span className="italic text-fresh/70">needs translation</span>
                            )}
                          </span>
                          {item.audioStatus === 'ready' && (
                            <span className="text-xs text-done" title="Has audio">♪</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add category - desktop only, owner only */}
      {isOwner && (
        <div className="mt-4 hidden md:block">
          {showAddCategory ? (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-background-elevated border border-border-subtle text-text text-sm focus:outline-none focus:border-accent"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCategory();
                  if (e.key === 'Escape') setShowAddCategory(false);
                }}
              />
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-accent text-background text-sm font-medium"
                onClick={handleAddCategory}
              >
                Add
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-border-subtle text-text text-sm"
                onClick={() => setShowAddCategory(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="w-full py-2.5 rounded-lg border border-dashed border-border-subtle text-text-soft text-sm hover:border-accent hover:text-accent transition-colors"
              onClick={() => setShowAddCategory(true)}
            >
              + Add category
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(deleteCategoryConfirm)}
        title={`Delete category "${deleteCategoryConfirm?.name ?? ''}"?`}
        message="All words in this category will be permanently deleted."
        confirmLabel="Delete"
        onConfirm={() => {
          const id = deleteCategoryConfirm?.id;
          setDeleteCategoryConfirm(null);
          if (id) onDeleteCategory(id);
        }}
        onCancel={() => setDeleteCategoryConfirm(null)}
      />

      <ConfirmModal
        isOpen={deleteListConfirm}
        title={`Delete list "${list.name}"?`}
        message="This will permanently delete the list and all its words. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteListConfirmed}
        onCancel={() => setDeleteListConfirm(false)}
      />
    </div>
  );
}

function countVisibleCategoryItems(
  map: Map<string, WordListItem[]>,
  categories: WordCategory[],
): number {
  let count = 0;
  for (const category of categories) {
    count += map.get(category.id)?.length ?? 0;
  }
  return count;
}
