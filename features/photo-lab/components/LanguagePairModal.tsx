'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { LanguageCombobox } from '@/features/learning/onboarding/LanguageCombobox';
import type { LearningLanguage } from '@/features/learning/onboarding/types';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';

/**
 * Language pair picker for Photo Lab. Changes apply immediately and affect the
 * next analysis only — the currently displayed session keeps its own pair.
 */
export function LanguagePairModal({
  isOpen,
  languages,
  loading,
  from,
  to,
  onChange,
  onClose,
}: {
  isOpen: boolean;
  languages: LearningLanguage[];
  loading: boolean;
  from: string;
  to: string;
  onChange: (pair: { from: string; to: string }) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const firstCombobox = document.getElementById('photo-lab-language-from');
    if (firstCombobox instanceof HTMLInputElement) {
      firstCombobox.focus();
    } else {
      dialogRef.current?.focus();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const modal = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-lab-languages-title"
        tabIndex={-1}
        style={warmPaletteVars}
        className="w-full max-w-sm rounded-2xl border-2 border-[color:var(--ob-ink)] bg-[var(--ob-surface)] p-5 text-[color:var(--ob-ink)] shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="photo-lab-languages-title" className="m-0 text-base font-semibold">
          {t('photoLab.languagesModalTitle')}
        </h2>
        <div className="mt-4 flex flex-col gap-4">
          <LanguageCombobox
            id="photo-lab-language-from"
            label={t('photoLab.knownLanguage')}
            value={from}
            languages={languages}
            loading={loading}
            onChange={(code) => onChange({ from: code, to })}
            disabledCodes={to ? [to] : []}
          />
          <LanguageCombobox
            id="photo-lab-language-to"
            label={t('photoLab.targetLanguage')}
            value={to}
            languages={languages}
            loading={loading}
            onChange={(code) => onChange({ from, to: code })}
            disabledCodes={from ? [from] : []}
          />
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="rounded-lg bg-[var(--ob-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            onClick={onClose}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
