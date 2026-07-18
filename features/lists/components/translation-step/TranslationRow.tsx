'use client';

import { useI18n } from '@/components/I18nProvider';
import type { WordCategory } from '@/features/lists/types';
import { MAX_COMMENT_TEXT_LENGTH } from '@/lib/word-item-comment';
import { TranslationTextarea } from './TranslationEditors';
import { TranslationRowMenu } from './TranslationRowMenu';
import type { TranslationRow as TranslationRowData } from './types';

export function TranslationRow({
  row,
  needsTranslation,
  languageFromLabel,
  languageToLabel,
  categories,
  currentCategoryId,
  duplicate,
  canDelete,
  canAssign,
  busy,
  focusedComment,
  onCellEdit,
  onCommentEdit,
  onCommentFocus,
  onCommentBlur,
  onEditAccepted,
  onDelete,
  onAssign,
}: {
  row: TranslationRowData;
  needsTranslation: 'textKnown' | 'textTarget';
  languageFromLabel: string;
  languageToLabel: string;
  categories: WordCategory[];
  currentCategoryId: string | null;
  duplicate: boolean;
  canDelete: boolean;
  canAssign: boolean;
  busy: boolean;
  focusedComment: boolean;
  onCellEdit: (field: 'textKnown' | 'textTarget', value: string) => void;
  onCommentEdit: (value: string) => void;
  onCommentFocus: () => void;
  onCommentBlur: () => void;
  onEditAccepted: () => void;
  onDelete: () => void;
  onAssign: (categoryId: string) => void;
}) {
  const { t } = useI18n();
  const status = (field: 'textKnown' | 'textTarget') => (
    needsTranslation === field && (
      row.status === 'error'
        ? <span className="mt-1 shrink-0 text-xs text-danger" title={row.error}>!</span>
        : row.warning
          ? <span className="mt-1 shrink-0 text-xs text-amber-500" title={row.warning}>?</span>
          : row.source === 'dedup'
            ? <span className="mt-1 shrink-0 text-xs text-done" title={t('lists.reusedFromExisting')}>{t('lists.audioStatusReused')}</span>
            : null
    )
  );
  const accepted = (side: 'known' | 'target') => {
    const values = side === 'known' ? row.acceptedKnown ?? [] : row.acceptedTarget ?? [];
    if (values.length === 0) return null;
    return (
      <button type="button" className="mt-1 flex max-w-full flex-wrap items-center gap-1 text-left" aria-label={`${t('lists.acceptedAnswersLabel')}: ${values.join(', ')}`} onClick={onEditAccepted}>
        <span className="mr-0.5 text-[11px] text-text-soft/70">{t('lists.acceptedAnswersExistingLabel')}</span>
        {values.map((answer) => <span key={answer} className="max-w-full truncate rounded bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent">{answer}</span>)}
      </button>
    );
  };

  return (
    <div className={`grid grid-cols-2 items-start gap-0 ${row.status === 'error' ? 'bg-danger/5' : ''}`}>
      <div className="flex items-start gap-2 border-r border-border-subtle px-3 py-2">
        <div className="min-w-0 flex-1">
          <TranslationTextarea value={row.textKnown} onChange={(value) => onCellEdit('textKnown', value)} placeholder={needsTranslation === 'textKnown' ? t('lists.enterTranslation') : undefined} ariaLabel={t('lists.sourceTextAria', { language: languageFromLabel })} />
          {accepted('known')}
        </div>
        {status('textKnown')}
      </div>
      <div className="flex items-start gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <TranslationTextarea value={row.textTarget} onChange={(value) => onCellEdit('textTarget', value)} placeholder={needsTranslation === 'textTarget' ? t('lists.enterTranslation') : undefined} ariaLabel={t('lists.translationTextAria', { language: languageToLabel })} />
          {accepted('target')}
        </div>
        {status('textTarget')}
      </div>
      <div className="col-span-2 flex items-start gap-1.5 border-t border-border-subtle/40 px-3 py-1.5">
        <span aria-hidden className="mt-1 shrink-0 text-xs text-text-soft/60" title={t('lists.studyNoteLabel')}>💬</span>
        <div className="min-w-0 flex-1">
          <TranslationTextarea value={row.comment ?? ''} onChange={onCommentEdit} placeholder={t('lists.studyNotePlaceholder')} ariaLabel={t('lists.studyNoteAria')} maxLength={MAX_COMMENT_TEXT_LENGTH} onFocus={onCommentFocus} onBlur={onCommentBlur} />
          {focusedComment && <div className="mt-0.5 text-right text-[11px] leading-none text-text-soft/60">{t('lists.studyNoteCharacterLimit', { count: (row.comment ?? '').length, limit: MAX_COMMENT_TEXT_LENGTH })}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {duplicate && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-600" title={t('lists.duplicateWordBadgeTitle')}>{t('lists.duplicateWordBadge')}</span>}
          {canAssign && !currentCategoryId && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-600" title={t('lists.noCategoryWarning', { count: 1 })}>{t('lists.noCategoryBadge')}</span>}
          <TranslationRowMenu categories={categories} currentCategoryId={currentCategoryId} acceptedCount={(row.acceptedKnown?.length ?? 0) + (row.acceptedTarget?.length ?? 0)} canDelete={canDelete} canAssign={canAssign} busy={busy} onEditAccepted={onEditAccepted} onDelete={onDelete} onAssign={onAssign} />
        </div>
      </div>
      {row.validationWarnings && row.validationWarnings.length > 0 && (
        <div className="col-span-2 flex flex-wrap items-center gap-2 border-t border-border-subtle/40 px-3 py-1.5">
          {row.validationWarnings.map((warning, index) => <span key={`${warning.code}-${index}`} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-600" title={warning.message}>{warning.message}</span>)}
        </div>
      )}
    </div>
  );
}
