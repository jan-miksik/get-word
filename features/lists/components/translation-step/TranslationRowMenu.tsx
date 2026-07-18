'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { WordCategory } from '@/features/lists/types';

export function TranslationRowMenu({
  categories,
  currentCategoryId,
  acceptedCount,
  canDelete,
  canAssign,
  busy,
  onEditAccepted,
  onDelete,
  onAssign,
}: {
  categories: WordCategory[];
  currentCategoryId: string | null;
  acceptedCount: number;
  canDelete: boolean;
  canAssign: boolean;
  busy: boolean;
  onEditAccepted: () => void;
  onDelete: () => void;
  onAssign: (categoryId: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const showCategories = canAssign && categories.length > 0;
  return (
    <div ref={containerRef} className="relative shrink-0">
      <button type="button" aria-label={t('lists.rowMenuLabel')} aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen((value) => !value)} className="flex h-6 w-6 items-center justify-center rounded-md text-text-soft transition-colors hover:bg-background-elevated hover:text-text disabled:opacity-40">
        {busy ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-border-subtle bg-background py-1 shadow-xl">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onEditAccepted(); }} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-text-soft transition-colors hover:bg-background-elevated hover:text-text">
            <span>{t('lists.acceptedAnswersLabel')}</span>
            {acceptedCount > 0 && <span className="min-w-5 rounded-full bg-accent/15 px-1.5 text-center text-[11px] font-medium text-accent">{acceptedCount}</span>}
          </button>
          {(canDelete || showCategories) && <div className="my-1 border-t border-border-subtle" />}
          {canDelete && <button type="button" role="menuitem" onClick={() => { setOpen(false); onDelete(); }} className="block w-full px-3 py-1.5 text-left text-sm text-danger transition-colors hover:bg-danger/10">{t('lists.deleteRow')}</button>}
          {showCategories && (
            <>
              {canDelete && <div className="my-1 border-t border-border-subtle" />}
              <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-text-soft/70">{t('lists.moveToCategory')}</div>
              <div className="max-h-48 overflow-y-auto">
                {categories.map((category) => {
                  const active = currentCategoryId === category.id;
                  return <button key={category.id} type="button" role="menuitemradio" aria-checked={active} onClick={() => { setOpen(false); if (!active) onAssign(category.id); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-background-elevated ${active ? 'text-text' : 'text-text-soft hover:text-text'}`}><span className="w-3 shrink-0 text-accent" aria-hidden>{active ? '✓' : ''}</span><span className="min-w-0 flex-1 break-words">{category.name}</span></button>;
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
