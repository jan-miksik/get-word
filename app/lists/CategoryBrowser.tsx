'use client';

import { useState, useCallback, useRef } from 'react';
import type { WordCategory, WordList, WordListItem } from '@/features/lists/types';

interface CategoryBrowserProps {
  list: WordList;
  categories: WordCategory[];
  itemsByCategory: Map<string, WordListItem[]>;
  isOwner: boolean;
  onEditCategory: (categoryId: string, inputLang: 'known' | 'target') => void;
  onCreateCategory: (name: string) => Promise<void>;
  onReorderCategories: (orderedIds: string[]) => Promise<void>;
  onDeleteCategory: (categoryId: string) => Promise<void>;
}

export function CategoryBrowser({
  list,
  categories,
  itemsByCategory,
  isOwner,
  onEditCategory,
  onCreateCategory,
  onReorderCategories,
  onDeleteCategory,
}: CategoryBrowserProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragItemRef = useRef<string | null>(null);

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

  const totalItems = items_count(itemsByCategory);

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      {/* List header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text">{list.name}</h1>
        <p className="text-sm text-text-soft mt-1">
          {list.languageFrom} → {list.languageTo} · {totalItems} words · {categories.length} categories
        </p>
        {list.description && (
          <p className="text-sm text-text-soft mt-1">{list.description}</p>
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
                        className="px-3 py-1.5 rounded-lg text-danger/70 text-xs hover:bg-danger/10 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete category "${category.name}"?`)) {
                            onDeleteCategory(category.id);
                          }
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

        {/* Uncategorized items */}
        {(() => {
          const uncategorized = itemsByCategory.get('uncategorized') ?? [];
          if (uncategorized.length === 0) return null;
          return (
            <div className="rounded-lg border border-border-subtle">
              <div className="px-4 py-3">
                <span className="font-medium text-text-soft text-sm">Uncategorized</span>
                <span className="ml-2 text-xs text-text-soft">{uncategorized.length} words</span>
              </div>
            </div>
          );
        })()}
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
    </div>
  );
}

function items_count(map: Map<string, WordListItem[]>): number {
  let count = 0;
  for (const items of map.values()) count += items.length;
  return count;
}
