'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { ALL_CATEGORIES } from './constants';

export function CategoryEditButton({
  currentCategories,
  onCategoryAdd,
  onCategoryRemove,
}: {
  currentCategories: string[];
  onCategoryAdd: (category: string) => void;
  onCategoryRemove: (category: string) => void;
}) {
  const { t } = useI18n();
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const categoryButtonRef = useRef<HTMLButtonElement>(null);

  const availableCategoriesToAdd = ALL_CATEGORIES.filter((cat) => !currentCategories.includes(cat));

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showCategoryDropdown &&
        categoryDropdownRef.current &&
        categoryButtonRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node) &&
        !categoryButtonRef.current.contains(event.target as Node)
      ) {
        setShowCategoryDropdown(false);
      }
    };

    if (showCategoryDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showCategoryDropdown]);

  return (
    <div className="relative pointer-events-auto">
      <button
        ref={categoryButtonRef}
        data-edit-button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setShowCategoryDropdown(!showCategoryDropdown);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className={`
          group relative flex items-center justify-center
          w-8 h-8 rounded-xl
          bg-white/[0.03] backdrop-blur-xl
          border border-white/[0.08]
          shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]
          transition-all duration-200 ease-out
          hover:bg-white/[0.08] hover:border-white/[0.15] hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)]
          hover:-translate-y-0.5
          active:translate-y-0 active:shadow-[0_2px_8px_rgba(0,0,0,0.3)]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50
          ${showCategoryDropdown ? 'bg-white/[0.08] border-sky-400/30 shadow-[0_0_20px_rgba(56,189,248,0.15)]' : ''}
        `}
        title={t('editor.editCategories')}
      >
        <span className="text-sm transition-transform duration-200 group-hover:scale-110">🏷️</span>
      </button>

      {/* Category dropdown - Glass panel */}
      <div
        ref={categoryDropdownRef}
        className={`
          absolute top-full right-0 mt-2
          min-w-[220px] p-3
          bg-slate-900/80 backdrop-blur-2xl
          border border-white/[0.08]
          rounded-2xl
          shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)_inset]
          z-[101] pointer-events-auto
          transition-all duration-200 ease-out
          ${showCategoryDropdown
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 -translate-y-2 scale-95 pointer-events-none'}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Current categories section */}
        <div className="mb-3">
            <div className="text-[0.65rem] uppercase tracking-wider text-slate-400 mb-2 font-medium">
            {t('editor.currentCategories')}
            </div>
          <div className="flex flex-wrap gap-1.5">
            {currentCategories.length > 0 ? (
              currentCategories.map((cat) => (
                <button
                  key={cat}
                  className={`
                    group/badge relative
                    px-2.5 py-1 rounded-lg
                    text-[0.7rem] font-medium
                    bg-white/[0.05] backdrop-blur
                    border border-white/[0.1]
                    transition-all duration-150
                    hover:bg-rose-500/20 hover:border-rose-400/40 hover:text-rose-300
                    active:scale-95
                    word-category-badge word-category-${cat.replace(/\s+/g, '-')}
                  `}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCategoryRemove(cat);
                  }}
                  title={t('editor.removeCategory')}
                >
                  <span>{cat}</span>
                  <span className="ml-1 opacity-60 group-hover/badge:opacity-100">×</span>
                </button>
              ))
            ) : (
              <span className="text-[0.7rem] text-slate-500 italic">{t('editor.noCategories')}</span>
            )}
          </div>
        </div>

        {/* Divider */}
        {availableCategoriesToAdd.length > 0 && (
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent my-3" />
        )}

        {/* Add categories section */}
        {availableCategoriesToAdd.length > 0 && (
          <div>
            <div className="text-[0.65rem] uppercase tracking-wider text-slate-400 mb-2 font-medium">
              {t('editor.addCategory')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableCategoriesToAdd.map((cat) => (
                <button
                  key={cat}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCategoryAdd(cat);
                  }}
                  className="
                    group/add relative
                    px-2.5 py-1 rounded-lg
                    text-[0.7rem] font-medium
                    bg-transparent
                    border border-dashed border-sky-400/30
                    text-sky-400/80
                    transition-all duration-150
                    hover:bg-sky-400/10 hover:border-sky-400/50 hover:text-sky-300
                    active:scale-95
                  "
                >
                  <span className="opacity-70 group-hover/add:opacity-100">+</span>
                  <span className="ml-1">{cat}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
