'use client';

import { useState, useEffect, useRef } from 'react';
import { NormalizedWord } from '@/lib/words';
import { ProgressData } from '@/lib/storage';
import { WordCard } from './WordCard';

interface EditableWordCardProps {
  word: NormalizedWord;
  index: number;
  progress: ProgressData;
  role: 'cz' | 'vi';
  modeIndex: number;
  showAll: boolean;
  memoryHook: string;
  suggestedHook: string;
  onKnown: () => void;
  onUnknown: () => void;
  onMemoryHookChange: (hook: string) => void;
  isMoved?: boolean;
  onWordChange: (index: number, field: keyof NormalizedWord, value: string | string[]) => void;
  onCategoryToggle: (category: string) => void;
  onCategoryAdd: (category: string) => void;
  onCategoryRemove: (category: string) => void;
  showEnglish?: boolean;
  showCategoryBadges?: boolean;
}

export const STANDARD_CATEGORIES = ['basic', 'basic 2', 'cz ≈ en', 'phrase', 'nails', 'word'];
export const EDIT_ONLY_CATEGORIES = ['to fix'];
export const ALL_CATEGORIES = [...STANDARD_CATEGORIES, ...EDIT_ONLY_CATEGORIES];

export function EditableWordCard({
  word,
  index,
  progress,
  role,
  modeIndex,
  showAll,
  memoryHook,
  suggestedHook,
  onKnown,
  onUnknown,
  onMemoryHookChange,
  isMoved,
  onWordChange,
  onCategoryToggle,
  onCategoryAdd,
  onCategoryRemove,
  showEnglish = true,
  showCategoryBadges = false,
}: EditableWordCardProps) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const categoryButtonRef = useRef<HTMLButtonElement>(null);

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
      style={{ position: 'relative' }}
      onMouseDown={(e) => {
        // Only stop propagation if clicking on buttons, otherwise let events pass through
        const target = e.target as HTMLElement;
        if (!target.closest('[data-edit-button]')) {
          // Allow event to bubble to card
          return;
        }
      }}
      onTouchStart={(e) => {
        // Only stop propagation if clicking on buttons, otherwise let events pass through
        const target = e.target as HTMLElement;
        if (!target.closest('[data-edit-button]')) {
          // Allow event to bubble to card
          return;
        }
      }}
    >
      {/* Edit button overlay - positioned relative to card */}
      <div style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        zIndex: 100,
        display: 'flex',
        gap: '4px',
        pointerEvents: 'none', // Allow clicks to pass through to card below
      }}>
        {/* Category edit button */}
        <div style={{ position: 'relative', pointerEvents: 'auto' }}>
          <button
            ref={categoryButtonRef}
            data-edit-button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setShowCategoryDropdown(!showCategoryDropdown);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            style={{
              padding: '4px 8px',
              fontSize: '0.75rem',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
            title="Edit categories"
          >
            🏷️
          </button>
          {showCategoryDropdown && (
            <div
              ref={categoryDropdownRef}
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                padding: '8px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                minWidth: '200px',
                zIndex: 101,
                pointerEvents: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-soft)', marginBottom: '8px' }}>
                Categories:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                {currentCategories.map((cat) => (
                  <span
                    key={cat}
                    className={`word-category-badge word-category-${cat.replace(/\s+/g, '-')}`}
                    style={{ cursor: 'pointer', fontSize: '0.7rem' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCategoryRemove(cat);
                      // Don't close dropdown - keep it open for multiple removals
                    }}
                    title="Click to remove"
                  >
                    {cat} ×
                  </span>
                ))}
              </div>
              {availableCategoriesToAdd.length > 0 && (
                <>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-soft)', marginBottom: '4px' }}>
                    Add:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {availableCategoriesToAdd.map((cat) => (
                      <button
                        key={cat}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCategoryAdd(cat);
                          // Don't close dropdown - keep it open for multiple additions
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.7rem',
                          borderRadius: 'var(--radius-pill)',
                          border: '1px solid var(--accent)',
                          background: 'transparent',
                          color: 'var(--accent)',
                          cursor: 'pointer',
                        }}
                      >
                        + {cat}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {/* Text edit button */}
        <button
          data-edit-button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setShowEditModal(true);
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          style={{
            padding: '4px 8px',
            fontSize: '0.75rem',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            color: 'var(--text)',
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
          title="Edit text fields"
        >
          ✏️
        </button>
      </div>

      {/* Text edit modal */}
      {showEditModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEditModal(false);
            }
          }}
        >
          <div
            style={{
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
              maxWidth: '600px',
              maxHeight: '80vh',
              width: '100%',
              border: '1px solid var(--border-subtle)',
              overflow: 'auto',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowEditModal(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'transparent',
                border: 'none',
                fontSize: '1.25rem',
                color: 'var(--text-soft)',
                cursor: 'pointer',
                padding: '0.25rem',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '1.5rem',
                height: '1.5rem',
                borderRadius: 'var(--radius-sm)',
                transition: 'all var(--transition-fast)',
                zIndex: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-elevated)';
                e.currentTarget.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-soft)';
              }}
              aria-label="Close edit modal"
            >
              ×
            </button>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>
              Edit Word Fields
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
              {(['cz', 'en', 'vi', 'czPron', 'viPron', 'czHint', 'viHint'] as const).map((field) => (
                <div key={field}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-soft)', marginBottom: '0.25rem' }}>
                    {field.toUpperCase()}
                  </label>
                  <input
                    type="text"
                    value={word[field] || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      onWordChange(index, field, value);
                    }}
                    placeholder={`Enter ${field}`}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              ))}
              {(['czAudio', 'viAudio'] as const).map((field) => (
                <div key={field}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-soft)', marginBottom: '0.25rem' }}>
                    {field.toUpperCase()} (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={Array.isArray(word[field]) ? (word[field] as string[]).join(', ') : (word[field] || '')}
                    onChange={(e) => {
                      const value = e.target.value;
                      const arrayValue = value.split(',').map(s => s.trim()).filter(Boolean);
                      onWordChange(index, field, arrayValue.length > 0 ? arrayValue : value);
                    }}
                    placeholder={`Enter ${field} (comma-separated for multiple)`}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Render the actual WordCard */}
      <WordCard
        word={word}
        index={index}
        progress={progress}
        role={role}
        modeIndex={modeIndex}
        showAll={showAll}
        memoryHook={memoryHook}
        suggestedHook={suggestedHook}
        onKnown={onKnown}
        onUnknown={onUnknown}
        onMemoryHookChange={onMemoryHookChange}
        isMoved={isMoved}
        isEditMode={true}
        onCategoryToggle={onCategoryToggle}
        showEnglish={showEnglish}
        showCategoryBadges={showCategoryBadges}
      />
    </div>
  );
}

