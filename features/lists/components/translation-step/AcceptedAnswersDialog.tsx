'use client';

import { useI18n } from '@/components/I18nProvider';
import { AcceptedAnswersEditor } from './TranslationEditors';
import type { AcceptedSide, TranslationRow } from './types';

export function AcceptedAnswersDialog({
  row,
  languageFromLabel,
  languageToLabel,
  onChange,
  onClose,
}: {
  row: TranslationRow;
  languageFromLabel: string;
  languageToLabel: string;
  onChange: (side: AcceptedSide, values: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border-subtle bg-background p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="accepted-answers-editor-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="accepted-answers-editor-title" className="text-base font-semibold text-text">{t('lists.acceptedAnswersLabel')}</h2>
        <p className="mt-1 text-sm text-text-soft">{t('lists.acceptedAnswersEditorHint')}</p>
        <div className="mt-5 space-y-4">
          {([
            { side: 'known' as const, language: languageFromLabel, primary: row.textKnown, values: row.acceptedKnown ?? [] },
            { side: 'target' as const, language: languageToLabel, primary: row.textTarget, values: row.acceptedTarget ?? [] },
          ]).map((field) => (
            <div key={field.side}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-text-soft">{field.language}</div>
              <div className="mt-1 break-words rounded-md bg-background-elevated px-2.5 py-2 text-sm text-text">{field.primary}</div>
              <AcceptedAnswersEditor values={field.values} primary={field.primary} label={t('lists.acceptedAnswersAddPlaceholder')} onChange={(values) => onChange(field.side, values)} />
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-strong" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}
