'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { NormalizedWord, Word } from '@/lib/words';

export function EditWordModal({
  word,
  onWordChange,
  onClose,
}: {
  word: NormalizedWord;
  onWordChange: (wordId: string, field: keyof Word, value: string | string[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  // Deep copy on mount so array fields don't share references with the prop.
  const [localWord, setLocalWord] = useState<Partial<Word>>(() => ({
    ...word,
    category: word.category ? [...word.category] : [],
  }));
  const isClosingRef = useRef(false);

  const fieldLabels = useMemo<Record<string, string>>(
    () => ({
      cz: t('editor.fieldCzech'),
      en: t('editor.fieldEnglish'),
      vi: t('editor.fieldVietnamese'),
      czPron: t('editor.fieldCzechPronunciation'),
      viPron: t('editor.fieldVietnamesePronunciation'),
      czHint: t('editor.fieldCzechHook'),
      viHint: t('editor.fieldVietnameseHook'),
      czAudio: t('editor.fieldCzechAudio'),
      viAudio: t('editor.fieldVietnameseAudio'),
    }),
    [t],
  );

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

  const requestClose = useCallback(() => {
    if (isClosingRef.current) return;
    try {
      syncChangesToParent();
    } catch (error) {
      console.error('Error syncing changes:', error);
    }
    onClose();
  }, [syncChangesToParent, onClose]);

  return createPortal(
    <div
      className="
        fixed inset-0 z-[1000]
        flex items-center justify-center
        p-4
        bg-black/60 backdrop-blur-sm
        animate-[fadeIn_200ms_ease-out]
      "
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          requestClose();
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
            <h3 className="text-base font-semibold text-white">{t('editor.editWord')}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{word.en || word.cz}</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              requestClose();
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
            aria-label={t('editor.closeEditWord')}
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
                    {fieldLabels[field]}
                  </label>
                  <input
                    type="text"
                    value={localWord[field] || ''}
                    onChange={(e) => setLocalWord(prev => ({ ...prev, [field]: e.target.value }))}
                    placeholder={t('editor.enterField', { field: fieldLabels[field].toLowerCase() })}
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
              <span className="text-[0.65rem] uppercase tracking-wider text-slate-500">{t('editor.pronunciationAndHooks')}</span>
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
                    {fieldLabels[field]}
                  </label>
                  <input
                    type="text"
                    value={localWord[field] || ''}
                    onChange={(e) => setLocalWord(prev => ({ ...prev, [field]: e.target.value }))}
                    placeholder={field.includes('Pron') ? t('editor.enterPronunciation') : t('editor.enterHook')}
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
              <span className="text-[0.65rem] uppercase tracking-wider text-slate-500">{t('editor.audioFiles')}</span>
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
                    {fieldLabels[field]}
                    <span className="ml-1 text-slate-500 normal-case tracking-normal">{t('editor.commaSeparated')}</span>
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
  );
}
