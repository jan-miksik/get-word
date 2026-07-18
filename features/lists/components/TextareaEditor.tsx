'use client';

import { useState, useMemo, useEffect } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { WordCategory, WordListItem } from '@/features/lists/types';

interface TextareaEditorProps {
  category: WordCategory;
  items: WordListItem[];
  inputLanguage: 'known' | 'target';
  onInputLanguageChange: (lang: 'known' | 'target') => void;
  onPreview: (lines: string[]) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function TextareaEditor({
  category,
  items,
  inputLanguage,
  onInputLanguageChange,
  onPreview,
  onCancel,
  onDirtyChange,
}: TextareaEditorProps) {
  const initialText = useMemo(() => {
    return [...items]
      .sort((a, b) => a.position - b.position)
      .map((item) => (inputLanguage === 'known' ? item.textKnown : item.textTarget) ?? '')
      .filter((t) => t.length > 0)
      .join('\n');
  }, [items, inputLanguage]);

  return (
    <TextareaEditorContent
      key={initialText}
      category={category}
      inputLanguage={inputLanguage}
      initialText={initialText}
      onInputLanguageChange={onInputLanguageChange}
      onPreview={onPreview}
      onCancel={onCancel}
      onDirtyChange={onDirtyChange}
    />
  );
}

function TextareaEditorContent({
  category,
  inputLanguage,
  initialText,
  onInputLanguageChange,
  onPreview,
  onCancel,
  onDirtyChange,
}: Omit<TextareaEditorProps, 'items'> & { initialText: string }) {
  const { t } = useI18n();

  const [text, setText] = useState(initialText);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const lineCount = text.split('\n').filter((l) => l.trim().length > 0).length;

  useEffect(() => {
    onDirtyChange?.(text !== initialText);
  }, [initialText, onDirtyChange, text]);

  async function handlePreview() {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const lines = text.split('\n');
      await onPreview(lines);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : t('lists.previewFailed'));
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text">{t('lists.editCategoryTitle', { name: category.name })}</h2>
          <p className="text-sm text-text-soft mt-0.5">{t('lists.onePerLine')}</p>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-border-subtle text-text text-sm hover:bg-background-elevated transition-colors"
          onClick={onCancel}
        >
          {t('common.cancel')}
        </button>
      </div>

      {/* Language toggle */}
      <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-background-elevated border border-border-subtle">
        <span className="text-sm text-text-soft">{t('lists.languageInputLabel')}</span>
        <div className="flex rounded-lg border border-border-subtle overflow-hidden">
          <button
            type="button"
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              inputLanguage === 'known'
                ? 'bg-accent text-background'
                : 'text-text-soft hover:text-text'
            }`}
            onClick={() => onInputLanguageChange('known')}
          >
            {t('lists.knownLanguage')}
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              inputLanguage === 'target'
                ? 'bg-accent text-background'
                : 'text-text-soft hover:text-text'
            }`}
            onClick={() => onInputLanguageChange('target')}
          >
            {t('lists.targetLanguage')}
          </button>
        </div>
      </div>

      {/* Textarea */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.max(15, lineCount + 3)}
        className="w-full px-4 py-3 rounded-lg bg-background-elevated border border-border-subtle text-text text-sm font-mono leading-relaxed resize-y focus:outline-none focus:border-accent"
        placeholder={t('lists.enterWordsPlaceholder')}
        spellCheck={false}
      />

      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-text-soft">
          {t('lists.nonEmptyLines', { count: lineCount })}
        </span>

        {previewError && (
          <span className="text-xs text-danger">{previewError}</span>
        )}

        <button
          type="button"
          disabled={previewing || lineCount === 0}
          className="px-4 py-2 rounded-lg bg-accent text-background text-sm font-medium disabled:opacity-50 hover:bg-accent-strong transition-colors"
          onClick={handlePreview}
        >
          {previewing ? t('lists.preparingPreview') : t('lists.previewChanges')}
        </button>
      </div>
    </div>
  );
}
