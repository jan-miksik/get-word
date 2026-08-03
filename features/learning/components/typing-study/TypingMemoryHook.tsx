'use client';

import { useEffect, useRef, useState } from 'react';
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
};

export function TypingMemoryHook({
  memoryHook,
  suggestedHook,
  onChange,
}: TypingMemoryHookProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const value = editing ? draft : memoryHook;
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTapAtRef = useRef(0);
  const displayHook = memoryHook || (suggestedHook ? `💡 ${suggestedHook}` : null);

  // This field sits at the bottom of the card, so the keyboard opens straight
  // over it. In card mode TypingStudyCard already re-centres whichever field
  // has focus; everywhere else (stream mode) the input has to ask for itself.
  useEffect(() => {
    if (!editing || typeof window === 'undefined') return;
    const input = inputRef.current;
    if (!input) return;
    const cardScroller = input.closest<HTMLElement>('.learning-card-main');
    if (cardScroller?.dataset.typingKeyboardOwner) return;

    const scrollIntoCenter = () => {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const viewport = window.visualViewport;
    if (viewport) {
      viewport.addEventListener('resize', scrollIntoCenter);
      return () => viewport.removeEventListener('resize', scrollIntoCenter);
    }
    const timer = window.setTimeout(scrollIntoCenter, 350);
    return () => window.clearTimeout(timer);
  }, [editing]);

  const startEditing = () => {
    if (!onChange) return;
    setDraft(memoryHook);
    setEditing(true);
    // Focus stays inside the tap gesture so iOS opens the keyboard on the first
    // tap; the input is hidden by opacity, which keeps it focusable here.
    inputRef.current?.focus();
  };

  const finishEditing = () => {
    setEditing(false);
    onChange?.(draft);
  };

  const cancelEditing = () => {
    setEditing(false);
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
        className="memory-hook-display relative cursor-pointer touch-manipulation select-none max-sm:w-full !text-[#2A2218] hover:!bg-[#2A2218]/5"
        data-lang="memory-hook"
        onDoubleClick={startEditing}
        onClick={handleTap}
      >
        <span className={`memory-hook-text relative inline-block min-h-[1.4em] !text-[#2A2218] ${!memoryHook ? 'opacity-60 italic' : ''}`}>
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
        className="memory-hook-input !border-2 !border-[#2A2218] !bg-[#F4EFE2] !text-[#2A2218] placeholder:!text-[#2A2218]/50 focus:!border-[#1E6FA8] focus:!shadow-none"
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
