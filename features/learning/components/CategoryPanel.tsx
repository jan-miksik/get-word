'use client';

import { useAppStateContext } from '@/context/AppStateContext';
import { useI18n } from '@/components/I18nProvider';
import { useCallback, useMemo, useState } from 'react';

interface CategoryPanelProps {
  isOpen: boolean;
  categories: Array<{
    key?: string;
    name: string;
    sourceName?: string;
    count: number;
    position?: number;
  }>;
  onClose?: () => void;
}

function getCategoryKey(category: { key?: string; name: string }) {
  return category.key ?? category.name;
}

export function CategoryPanel({ isOpen, categories, onClose }: CategoryPanelProps) {
  const { t } = useI18n();
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
    (categoryOrder ?? []).forEach((key, i) => index.set(key, i));

    return [...categories].sort((a, b) => {
      const ai = index.get(getCategoryKey(a)) ?? index.get(a.name);
      const bi = index.get(getCategoryKey(b)) ?? index.get(b.name);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      if (a.position !== undefined && b.position !== undefined && a.position !== b.position) {
        return a.position - b.position;
      }
      if (a.position !== undefined) return -1;
      if (b.position !== undefined) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [categories, categoryOrder]);

  const commitOrder = useCallback(
    (keys: string[]) => {
      const normalized = keys.map((key) => String(key).trim()).filter(Boolean);
      const unique = Array.from(new Set(normalized));
      setCategoryOrder(unique);
    },
    [setCategoryOrder]
  );

  const moveCategory = useCallback(
    (key: string, delta: -1 | 1) => {
      const keys = orderedCategories.map(getCategoryKey);
      const from = keys.indexOf(key);
      if (from === -1) return;
      const to = from + delta;
      if (to < 0 || to >= keys.length) return;
      const next = [...orderedCategories];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      commitOrder(next.map(getCategoryKey));
    },
    [orderedCategories, commitOrder]
  );

  const handleDropOn = useCallback(
    (targetKey: string) => {
      if (!draggingName || draggingName === targetKey) return;
      const keys = orderedCategories.map(getCategoryKey);
      const from = keys.indexOf(draggingName);
      const to = keys.indexOf(targetKey);
      if (from === -1 || to === -1) return;
      const next = [...orderedCategories];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      commitOrder(next.map(getCategoryKey));
    },
    [draggingName, orderedCategories, commitOrder]
  );

  return (
    <section
      className={`category-panel ${isOpen ? 'is-open fixed inset-0' : ''}`}
      aria-label={t('category.aria')}
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
          <h2 className="m-0 text-[1.05rem]">{t('category.title')}</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-md p-1 text-[1.25rem] text-text-soft transition-colors duration-150 hover:bg-background-elevated hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              aria-label={t('category.close')}
            >
              ×
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="m-0 text-[0.92rem] text-text-soft">
            {t('category.description')}
          </p>
          <button
            type="button"
            className="category-clear-btn text-[0.9rem]"
            onClick={() => setCategoryOrder([])}
            disabled={!Array.isArray(categoryOrder) || categoryOrder.length === 0}
            aria-label={t('category.resetOrder')}
            title={t('category.resetOrderTitle')}
          >
            {t('category.resetOrder')}
          </button>
        </div>

        {orderedCategories.length === 0 ? (
          <p className="m-0 text-text-soft">{t('category.empty')}</p>
        ) : (
          <ul className="category-order-list custom-scrollbar" role="list">
            {orderedCategories.map((cat, i) => {
              const key = getCategoryKey(cat);
              const isSelected = selectedCategories.has(key);
              const isDragging = draggingName === key;
              const isOver = dragOverName === key && draggingName && draggingName !== key;
              return (
                <li
                  key={key}
                  className={`category-order-item ${isSelected ? 'is-selected' : ''} ${
                    isDragging ? 'is-dragging' : ''
                  } ${isOver ? 'is-over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverName(key);
                  }}
                  onDragLeave={() => setDragOverName((v) => (v === key ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOn(key);
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
                      setDraggingName(key);
                    }}
                    onDragEnd={() => {
                      setDraggingName(null);
                      setDragOverName(null);
                    }}
                    aria-label={t('category.dragToReorderItem', { name: cat.name })}
                    title={t('category.dragToReorder')}
                  >
                    ⠿
                  </button>

                  <label className="category-order-label">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleCategory(key)}
                    />
                    <span className="category-order-name">
                      {cat.name}
                      {cat.sourceName ? (
                        <small className="ml-1 opacity-60">· {cat.sourceName}</small>
                      ) : null}
                    </span>
                    <span className="category-order-count">{cat.count}</span>
                  </label>

                  <div className="category-order-actions">
                    <button
                      type="button"
                      className="category-order-btn"
                      onClick={() => moveCategory(key, -1)}
                      disabled={i === 0}
                      aria-label={t('category.moveItemUp', { name: cat.name })}
                      title={t('category.moveUp')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="category-order-btn"
                      onClick={() => moveCategory(key, 1)}
                      disabled={i === orderedCategories.length - 1}
                      aria-label={t('category.moveItemDown', { name: cat.name })}
                      title={t('category.moveDown')}
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
