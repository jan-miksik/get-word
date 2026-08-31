'use client';

import { useRef, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import {
  limitMemoryHookLength,
  MEMORY_HOOK_MAX_LENGTH,
} from '@/features/learning/state/memoryHooks';

const isMobileLayout = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(max-width: 767px)').matches === true;

type TypingMemoryHookProps = {
  memoryHook: string;
  suggestedHook: string;
  onChange?: (hook: string) => void;
  onEditingChange?: (editing: boolean) => void;
};

export function TypingMemoryHook({
  memoryHook,
  suggestedHook,
  onChange,
  onEditingChange,
}: TypingMemoryHookProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const value = editing ? draft : memoryHook;
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTapAtRef = useRef(0);
  const displayHook = memoryHook || (suggestedHook ? `💡 ${suggestedHook}` : null);

  const startEditing = () => {
    if (!onChange) return;
    setDraft(memoryHook);
    setEditing(true);
    onEditingChange?.(true);
    // Focus stays inside the tap gesture so iOS opens the keyboard on the first
    // tap; the input is hidden by opacity, which keeps it focusable here.
    inputRef.current?.focus();
  };

  const finishEditing = () => {
    setEditing(false);
    onEditingChange?.(false);
    onChange?.(draft);
  };

  const cancelEditing = () => {
    setEditing(false);
    onEditingChange?.(false);
  };

  const handleTap = () => {
    if (!isMobileLayout()) {
      if (!memoryHook) startEditing();
      return;
    }
    const isSecondTap = Date.now() - lastTapAtRef.current < 350;
    lastTapAtRef.current = Date.now();
    if (isSecondTap) startEditing();
  };

  return (
    <div className={`memory-hook-container mx-auto mt-1 mb-0 w-[calc(100%-2rem)] max-w-md self-center ${editing ? 'editing' : ''}`}>
      <div
        className="memory-hook-display relative cursor-pointer touch-manipulation select-none max-sm:w-full !text-ink hover:!bg-ink/5"
        data-lang="memory-hook"
        onDoubleClick={startEditing}
        onClick={handleTap}
      >
        <span className={`memory-hook-text relative inline-block min-h-[1.4em] !text-ink ${!memoryHook ? 'opacity-60 italic' : ''}`}>
          {displayHook ?? (
            <>
              <span className="sm:hidden">💭 {t('card.memoryHookPlaceholderMobile')}</span>
              <span className="hidden sm:inline">💭 {t('card.memoryHookPlaceholder')}</span>
            </>
          )}
        </span>
      </div>
      <input
        ref={inputRef}
        type="text"
        className="memory-hook-input !border-2 !border-ink !bg-paper !text-ink placeholder:!text-ink/50 focus:!border-sea focus:!shadow-none"
        placeholder={t('card.memoryHookPlaceholderMobile')}
        value={value}
        maxLength={MEMORY_HOOK_MAX_LENGTH}
        onChange={(event) => setDraft(limitMemoryHookLength(event.target.value))}
        onBlur={finishEditing}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finishEditing();
          else if (event.key === 'Escape') cancelEditing();
        }}
      />
    </div>
  );
}
