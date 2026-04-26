'use client';

import { useAppStateContext } from '@/context/AppStateContext';
import { useCallback, useMemo, useState } from 'react';

interface CategoryPanelProps {
  isOpen: boolean;
  categories: Array<{ name: string; count: number }>;
  onClose?: () => void;
}

export function CategoryPanel({ isOpen, categories, onClose }: CategoryPanelProps) {
  const {
    selectedCategories,
    toggleCategory: onToggleCategory,
    categoryOrder,
    setCategoryOrder,
  } = useAppStateContext();

  const [draggingName, setDraggingName] = useState<string | null>(null);
  const [dragOverName, setDragOverName] = useState<string | null>(null);

  const orderedCategories = useMemo(() => {
    if (!Array.isArray(categories) || categories.length === 0) return [];
    const index = new Map<string, number>();
    (categoryOrder ?? []).forEach((name, i) => index.set(name, i));

    return [...categories].sort((a, b) => {
      const ai = index.get(a.name);
      const bi = index.get(b.name);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [categories, categoryOrder]);

  const commitOrderFromNames = useCallback(
    (names: string[]) => {
      const normalized = names.map((n) => String(n).trim()).filter(Boolean);
      const unique = Array.from(new Set(normalized));
      setCategoryOrder(unique);
    },
    [setCategoryOrder]
  );

  const moveCategory = useCallback(
    (name: string, delta: -1 | 1) => {
      const names = orderedCategories.map((c) => c.name);
      const from = names.indexOf(name);
      if (from === -1) return;
      const to = from + delta;
      if (to < 0 || to >= names.length) return;
      const next = [...names];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      commitOrderFromNames(next);
    },
    [orderedCategories, commitOrderFromNames]
  );

  const handleDropOn = useCallback(
    (targetName: string) => {
      if (!draggingName || draggingName === targetName) return;
      const names = orderedCategories.map((c) => c.name);
      const from = names.indexOf(draggingName);
      const to = names.indexOf(targetName);
      if (from === -1 || to === -1) return;
      const next = [...names];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      commitOrderFromNames(next);
    },
    [draggingName, orderedCategories, commitOrderFromNames]
  );

  return (
    <section
      className={`category-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Category filter"
      onClick={(e) => e.stopPropagation()}
    >
      {isOpen && onClose && (
        <div
          className="panel-backdrop"
          onClick={onClose}
          aria-hidden
        />
      )}
      <div className="panel-content">
      <div className="px-3.5 pt-3.5 pb-4">
        <div className="flex items-center justify-between gap-3 mb-3 relative">
          <h2 className="m-0 text-[1.05rem]">Categories:</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-md p-1 text-[1.25rem] text-text-soft transition-colors duration-150 hover:bg-background-elevated hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              aria-label="Close categories"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="m-0 text-[0.92rem] text-text-soft">
            Drag to reorder. Checked categories stay visible.
          </p>
          <button
            type="button"
            className="category-clear-btn text-[0.9rem]"
            onClick={() => setCategoryOrder([])}
            disabled={!Array.isArray(categoryOrder) || categoryOrder.length === 0}
            aria-label="Reset category order"
            title="Reset order to alphabetical"
          >
            Reset order
          </button>
        </div>

        {orderedCategories.length === 0 ? (
          <p className="m-0 text-text-soft">No categories available.</p>
        ) : (
          <ul className="category-order-list custom-scrollbar" role="list">
            {orderedCategories.map((cat, i) => {
              const isSelected = selectedCategories.has(cat.name);
              const isDragging = draggingName === cat.name;
              const isOver = dragOverName === cat.name && draggingName && draggingName !== cat.name;
              return (
                <li
                  key={cat.name}
                  className={`category-order-item ${isSelected ? 'is-selected' : ''} ${
                    isDragging ? 'is-dragging' : ''
                  } ${isOver ? 'is-over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverName(cat.name);
                  }}
                  onDragLeave={() => setDragOverName((v) => (v === cat.name ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOn(cat.name);
                    setDraggingName(null);
                    setDragOverName(null);
                  }}
                >
                  <button
                    type="button"
                    className="category-drag-handle"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      try {
                        e.dataTransfer.setData('text/plain', cat.name);
                      } catch {
                        // ignore (some browsers restrict setData in certain contexts)
                      }
                      setDraggingName(cat.name);
                    }}
                    onDragEnd={() => {
                      setDraggingName(null);
                      setDragOverName(null);
                    }}
                    aria-label={`Drag to reorder ${cat.name}`}
                    title="Drag to reorder"
                  >
                    ⠿
                  </button>

                  <label className="category-order-label">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleCategory(cat.name)}
                    />
                    <span className="category-order-name">{cat.name}</span>
                    <span className="category-order-count">{cat.count}</span>
                  </label>

                  <div className="category-order-actions">
                    <button
                      type="button"
                      className="category-order-btn"
                      onClick={() => moveCategory(cat.name, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${cat.name} up`}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="category-order-btn"
                      onClick={() => moveCategory(cat.name, 1)}
                      disabled={i === orderedCategories.length - 1}
                      aria-label={`Move ${cat.name} down`}
                      title="Move down"
                    >
                      ↓
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      </div>
    </section>
  );
}
