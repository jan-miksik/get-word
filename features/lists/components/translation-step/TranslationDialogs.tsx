'use client';

import { useI18n } from '@/components/I18nProvider';
import type { DuplicateGroup } from './types';

export function ClearTranslationColumnDialog({
  language,
  count,
  confirming,
  onConfirm,
  onClose,
}: {
  language: string;
  count: number;
  confirming: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg border border-border-subtle bg-background p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-base font-semibold text-text">{t('lists.clearColumnTitle', { language })}</h2>
        <p className="mt-2 text-sm text-text-soft">{t('lists.clearColumnMessage', { language, count })}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-soft transition-colors hover:bg-background-elevated" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-60" onClick={onConfirm} disabled={confirming}>{confirming ? t('common.saving') : t('lists.clearColumnConfirm')}</button>
        </div>
      </div>
    </div>
  );
}

export function DuplicateRowsDialog({
  groups,
  keepByGroup,
  removeCount,
  onKeep,
  onConfirm,
  onClose,
}: {
  groups: DuplicateGroup[];
  keepByGroup: Record<string, string>;
  removeCount: number;
  onKeep: (groupKey: string, rowId: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border-subtle bg-background p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-base font-semibold text-text">{t('lists.duplicatesModalTitle')}</h2>
        <p className="mt-1 text-sm text-text-soft">{t('lists.duplicatesModalHint')}</p>
        <div className="mt-4 flex-1 divide-y divide-border-subtle overflow-y-auto">
          {groups.map((group) => {
            const keepId = keepByGroup[group.key] ?? group.rows[0].id;
            return (
              <div key={group.key} className="py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-text-soft">{group.word}</div>
                <div className="mt-1.5 space-y-1">
                  {group.rows.map((row) => {
                    const keep = row.id === keepId;
                    return (
                      <label key={row.id} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${keep ? 'bg-background-elevated' : 'opacity-70'}`}>
                        <input type="radio" name={`keep-${group.key}`} checked={keep} onChange={() => onKeep(group.key, row.id)} className="accent-accent" />
                        <span className="min-w-0 flex-1 break-words text-sm"><span className="text-text">{row.textKnown || '—'}</span><span className="text-text-soft"> → {row.textTarget || '—'}</span></span>
                        <span className={`shrink-0 text-[11px] ${keep ? 'text-done' : 'text-danger'}`}>{keep ? t('lists.duplicatesKeep') : t('lists.duplicatesRemove')}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-soft transition-colors hover:bg-background-elevated" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" disabled={removeCount === 0} className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-60" onClick={onConfirm}>{t('lists.duplicatesRemoveCta', { count: removeCount })}</button>
        </div>
      </div>
    </div>
  );
}
