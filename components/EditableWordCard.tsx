'use client';

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NormalizedWord } from '@/lib/words';
import { Word } from '@/data/words';
import { ProgressData } from '@/lib/sync';
import { WordCard } from './WordCard';

interface EditableWordCardProps {
  word: NormalizedWord;
  progress: ProgressData;
  role: 'cz' | 'vi';
  modeIndex: number;
  showAll: boolean;
  memoryHook: string;
  suggestedHook: string;
  onKnown: () => void;
  onReallyKnown?: () => void;
  onUnknown: () => void;
  onMemoryHookChange: (hook: string) => void;
  isMoved?: boolean;
  onWordChange: (wordId: string, field: keyof Word, value: string | string[]) => void;
  onCategoryToggle: (category: string) => void;
  onCategoryAdd: (category: string) => void;
  onCategoryRemove: (category: string) => void;
  showEnglish?: boolean;
  showCategoryBadges?: boolean;
  showPronunciation?: boolean;
  categoryOrder?: string[];
}

export const STANDARD_CATEGORIES = ['basic', 'basic 2', 'cz ≈ en', 'phrase', 'nails', 'word'];
export const EDIT_ONLY_CATEGORIES = ['to fix'];
export const ALL_CATEGORIES = [...STANDARD_CATEGORIES, ...EDIT_ONLY_CATEGORIES];

// Field labels for better UX
const FIELD_LABELS: Record<string, string> = {
  cz: 'Czech',
  en: 'English',
  vi: 'Vietnamese',
  czPron: 'Czech Pronunciation',
  viPron: 'Vietnamese Pronunciation',
  czHint: 'Czech Hint',
  viHint: 'Vietnamese Hint',
  czAudio: 'Czech Audio',
  viAudio: 'Vietnamese Audio',
};

export const EditableWordCard = memo(function EditableWordCard({
  word,
  progress,
  role,
  modeIndex,
  showAll,
  memoryHook,
  suggestedHook,
  onKnown,
  onReallyKnown,
  onUnknown,
  onMemoryHookChange,
  isMoved,
  onWordChange,
  onCategoryToggle,
  onCategoryAdd,
  onCategoryRemove,
  showEnglish = true,
  showCategoryBadges = false,
  showPronunciation = true,
  categoryOrder,
}: EditableWordCardProps) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const categoryButtonRef = useRef<HTMLButtonElement>(null);
  
  // Local state for editing - only syncs to parent on modal close
  const [localWord, setLocalWord] = useState<Partial<Word>>(word);
  const isClosingRef = useRef(false);
  
  // Update local state when word prop changes (e.g., from external updates)
  // But only if modal is closed and we're not in the process of closing
  useEffect(() => {
    if (!showEditModal && !isClosingRef.current) {
      setLocalWord(word);
    }
  }, [word, showEditModal]);
  
  // Sync function that updates parent state
  const syncChangesToParent = useCallback(() => {
    if (isClosingRef.current) return; // Prevent double-sync
    
    isClosingRef.current = true;
    
    // Use requestAnimationFrame to batch all updates together
    requestAnimationFrame(() => {
      // Sync all changed fields
      (['cz', 'en', 'vi', 'czPron', 'viPron', 'czAudio', 'viAudio', 'czHint', 'viHint', 'category'] as const).forEach((field) => {
        const localValue = localWord[field];
        const originalValue = word[field];
        
        // Handle array comparison for category
        if (field === 'category') {
          const localArr = Array.isArray(localValue) ? localValue : [];
          const originalArr = Array.isArray(originalValue) ? originalValue : [];
          const localSorted = [...localArr].sort().join(',');
          const originalSorted = [...originalArr].sort().join(',');
          if (localSorted !== originalSorted) {
            onWordChange(word.id, field, localArr);
          }
        } else {
          // String comparison
          const localStr = String(localValue ?? '');
          const originalStr = String(originalValue ?? '');
          if (localStr !== originalStr) {
            onWordChange(word.id, field, localStr);
          }
        }
      });
      
      // Reset flag after a short delay
      setTimeout(() => {
        isClosingRef.current = false;
      }, 200);
    });
  }, [localWord, word, onWordChange]);

  const availableCategoriesToAdd = ALL_CATEGORIES.filter(cat => !word.category?.includes(cat));
  const currentCategories = word.category || [];

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
    <div
      className="relative"
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-edit-button]')) {
          return;
        }
      }}
      onTouchStart={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-edit-button]')) {
          return;
        }
      }}
    >
      {/* Edit button overlay - Glass morphism buttons */}
      <div className="absolute top-2 right-2 z-[100] flex gap-1.5 pointer-events-none">
        {/* Category edit button */}
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
            title="Edit categories"
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
                Current
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
                      title="Click to remove"
                    >
                      <span>{cat}</span>
                      <span className="ml-1 opacity-60 group-hover/badge:opacity-100">×</span>
                    </button>
                  ))
                ) : (
                  <span className="text-[0.7rem] text-slate-500 italic">None</span>
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
                  Add
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

        {/* Text edit button */}
        <button
          data-edit-button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            isClosingRef.current = false; // Reset closing flag
            // Deep copy to avoid reference issues, especially for arrays
            setLocalWord({
              ...word,
              category: word.category ? [...word.category] : [],
            });
            setShowEditModal(true);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="
            group relative flex items-center justify-center
            w-8 h-8 rounded-xl pointer-events-auto
            bg-white/[0.03] backdrop-blur-xl
            border border-white/[0.08]
            shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]
            transition-all duration-200 ease-out
            hover:bg-white/[0.08] hover:border-white/[0.15] hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)]
            hover:-translate-y-0.5
            active:translate-y-0 active:shadow-[0_2px_8px_rgba(0,0,0,0.3)]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50
          "
          title="Edit text fields"
        >
          <span className="text-sm transition-transform duration-200 group-hover:scale-110">✏️</span>
        </button>
      </div>

      {/* Text edit modal - portaled to body so it escapes virtualized list transform (fixed positioning) */}
      {showEditModal &&
        createPortal(
          <div
            className="
              fixed inset-0 z-[1000]
              flex items-center justify-center
              p-4
              bg-black/60 backdrop-blur-sm
              animate-[fadeIn_200ms_ease-out]
            "
            onClick={(e) => {
              if (e.target === e.currentTarget && !isClosingRef.current) {
                try {
                  syncChangesToParent();
                } catch (error) {
                  console.error('Error syncing changes:', error);
                }
                setShowEditModal(false);
              }
            }}
          >
            <div
              className="
                relative w-full max-w-lg max-h-[85vh]
                bg-slate-900/90 backdrop-blur-2xl
                border border-white/[0.08]
                rounded-3xl
                shadow-[0_24px_64px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)_inset]
                overflow-hidden
                animate-[slideUp_300ms_cubic-bezier(0.16,1,0.3,1)]
              "
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="
                sticky top-0 z-10
                flex items-center justify-between
                px-6 py-4
                bg-slate-900/80 backdrop-blur-xl
                border-b border-white/[0.05]
              ">
                <div>
                  <h3 className="text-base font-semibold text-white">Edit Word</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{word.en || word.cz}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isClosingRef.current) {
                      try {
                        syncChangesToParent();
                      } catch (error) {
                        console.error('Error syncing changes:', error);
                      }
                      setShowEditModal(false);
                    }
                  }}
                  className="
                    flex items-center justify-center
                    w-8 h-8 rounded-xl
                    bg-white/[0.05]
                    border border-white/[0.08]
                    text-slate-400
                    transition-all duration-150
                    hover:bg-white/[0.1] hover:text-white hover:border-white/[0.15]
                    active:scale-95
                  "
                  aria-label="Close edit modal"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal content */}
              <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)] custom-scrollbar">
                <div className="space-y-4">
                  {/* Main language fields */}
                  <div className="grid grid-cols-1 gap-4">
                    {(['cz', 'en', 'vi'] as const).map((field) => (
                      <div key={field} className="group">
                        <label className="
                          block text-[0.7rem] uppercase tracking-wider
                          text-slate-400 mb-1.5 font-medium
                          transition-colors group-focus-within:text-sky-400
                        ">
                          {FIELD_LABELS[field]}
                        </label>
                        <input
                          type="text"
                          value={localWord[field] || ''}
                          onChange={(e) => setLocalWord(prev => ({ ...prev, [field]: e.target.value }))}
                          placeholder={`Enter ${FIELD_LABELS[field].toLowerCase()}`}
                          className="
                            w-full px-4 py-2.5 rounded-xl
                            bg-white/[0.03]
                            border border-white/[0.08]
                            text-white text-sm
                            placeholder:text-slate-500
                            transition-all duration-200
                            focus:outline-none focus:bg-white/[0.05]
                            focus:border-sky-400/50 focus:shadow-[0_0_20px_rgba(56,189,248,0.1)]
                          "
                        />
                      </div>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                    <span className="text-[0.65rem] uppercase tracking-wider text-slate-500">Pronunciation & Hints</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                  </div>

                  {/* Pronunciation and hint fields */}
                  <div className="grid grid-cols-2 gap-3">
                    {(['czPron', 'viPron', 'czHint', 'viHint'] as const).map((field) => (
                      <div key={field} className="group">
                        <label className="
                          block text-[0.65rem] uppercase tracking-wider
                          text-slate-400 mb-1.5 font-medium
                          transition-colors group-focus-within:text-sky-400
                        ">
                          {FIELD_LABELS[field]}
                        </label>
                        <input
                          type="text"
                          value={localWord[field] || ''}
                          onChange={(e) => setLocalWord(prev => ({ ...prev, [field]: e.target.value }))}
                          placeholder={`Enter ${field.includes('Pron') ? 'pronunciation' : 'hint'}`}
                          className="
                            w-full px-3 py-2 rounded-xl
                            bg-white/[0.03]
                            border border-white/[0.08]
                            text-white text-sm
                            placeholder:text-slate-500
                            transition-all duration-200
                            focus:outline-none focus:bg-white/[0.05]
                            focus:border-sky-400/50 focus:shadow-[0_0_20px_rgba(56,189,248,0.1)]
                          "
                        />
                      </div>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                    <span className="text-[0.65rem] uppercase tracking-wider text-slate-500">Audio Files</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                  </div>

                  {/* Audio fields */}
                  <div className="grid grid-cols-1 gap-3">
                    {(['czAudio', 'viAudio'] as const).map((field) => (
                      <div key={field} className="group">
                        <label className="
                          block text-[0.65rem] uppercase tracking-wider
                          text-slate-400 mb-1.5 font-medium
                          transition-colors group-focus-within:text-sky-400
                        ">
                          {FIELD_LABELS[field]}
                          <span className="ml-1 text-slate-500 normal-case tracking-normal">(comma-separated)</span>
                        </label>
                        <input
                          type="text"
                          value={Array.isArray(localWord[field]) ? (localWord[field] as string[]).join(', ') : (localWord[field] || '')}
                          onChange={(e) => {
                            const value = e.target.value;
                            const arrayValue = value.split(',').map(s => s.trim()).filter(Boolean);
                            setLocalWord(prev => ({ ...prev, [field]: arrayValue.length > 0 ? arrayValue : value }));
                          }}
                          placeholder="path/to/audio.mp3"
                          className="
                            w-full px-3 py-2 rounded-xl
                            bg-white/[0.03]
                            border border-white/[0.08]
                            text-white text-sm font-mono
                            placeholder:text-slate-500
                            transition-all duration-200
                            focus:outline-none focus:bg-white/[0.05]
                            focus:border-sky-400/50 focus:shadow-[0_0_20px_rgba(56,189,248,0.1)]
                          "
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      <WordCard
        word={word}
        progress={progress}
        role={role}
        modeIndex={modeIndex}
        showAll={showAll}
        memoryHook={memoryHook}
        suggestedHook={suggestedHook}
        onKnown={onKnown}
        onReallyKnown={onReallyKnown}
        onUnknown={onUnknown}
        onMemoryHookChange={onMemoryHookChange}
        isMoved={isMoved}
        isEditMode={true}
        onCategoryToggle={onCategoryToggle}
        showEnglish={showEnglish}
        showCategoryBadges={showCategoryBadges}
        showPronunciation={showPronunciation}
        categoryOrder={categoryOrder}
      />
    </div>
  );
});
