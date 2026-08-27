'use client';

import { useMemo } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type {
  AcceptedSide,
  BulkAcceptedScan,
  TranslationRow,
} from './types';

interface BulkAcceptedReviewDialogProps {
  rows: TranslationRow[];
  scan: BulkAcceptedScan;
  selected: ReadonlySet<string>;
  applying: boolean;
  copied: boolean;
  fieldLabel: (side: AcceptedSide) => string;
  onCopy: (summary: string) => void;
  onSelect: (keys: Set<string>) => void;
  onToggle: (key: string) => void;
  onApply: () => void;
  onClose: () => void;
}

export function BulkAcceptedReviewDialog({
  rows,
  scan,
  selected,
  applying,
  copied,
  fieldLabel,
  onCopy,
  onSelect,
  onToggle,
  onApply,
  onClose,
}: BulkAcceptedReviewDialogProps) {
  const { t } = useI18n();
  const groups = useMemo(
    () => rows
      .map((row) => ({
        row,
        entries: scan.entries.filter((entry) => entry.rowId === row.id),
      }))
      .filter((group) => group.entries.length > 0),
    [rows, scan.entries],
  );
  const selectedCount = scan.entries.filter((entry) => selected.has(entry.key)).length;
  const summary = groups
    .map((group) => [
      `${group.row.textKnown} → ${group.row.textTarget}`,
      ...group.entries.map((entry) => `${fieldLabel(entry.side)}: ${entry.value}`),
    ].join('\n'))
    .join('\n\n');

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border-subtle bg-background p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-text">
          {t('lists.acceptedAnswersBulkTitle')}
        </h2>
        <p className="mt-1 text-sm text-text-soft">{t('lists.acceptedAnswersBulkMessage')}</p>

        {scan.failedCount > 0 && (
          <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
            <p>{t('lists.acceptedAnswersBulkFailed', { count: scan.failedCount })}</p>
            {scan.failureMessage && (
              <p className="mt-1 break-words opacity-90">{scan.failureMessage}</p>
            )}
          </div>
        )}
        {scan.skippedCount > 0 && (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600">
            {t('lists.acceptedAnswersBulkSkipped', { count: scan.skippedCount })}
          </div>
        )}

        {scan.entries.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              className="rounded border border-border-subtle px-2 py-1 text-text-soft transition-colors hover:bg-background-elevated"
              onClick={() => onCopy(summary)}
            >
              {copied ? t('common.copied') : t('lists.acceptedAnswersBulkCopy')}
            </button>
            <button
              type="button"
              className="rounded border border-border-subtle px-2 py-1 text-text-soft transition-colors hover:bg-background-elevated"
              onClick={() => onSelect(new Set(scan.entries.map((entry) => entry.key)))}
            >
              {t('lists.acceptedAnswersBulkSelectAll')}
            </button>
            <button
              type="button"
              className="rounded border border-border-subtle px-2 py-1 text-text-soft transition-colors hover:bg-background-elevated"
              onClick={() => onSelect(new Set())}
            >
              {t('lists.acceptedAnswersBulkSelectNone')}
            </button>
            <span className="text-text-soft">
              {t('lists.acceptedAnswersBulkSelectedCount', {
                selected: selectedCount,
                total: scan.entries.length,
              })}
            </span>
          </div>
        )}

        <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.row.id} className="rounded-md border border-border-subtle p-2.5">
              <div className="break-words text-sm font-medium text-text">
                {group.row.textKnown}
                <span className="text-text-soft"> → </span>
                {group.row.textTarget}
              </div>
              <div className="mt-1.5 space-y-1">
                {group.entries.map((entry) => (
                  <label
                    key={entry.key}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 hover:bg-background-elevated"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(entry.key)}
                      onChange={() => onToggle(entry.key)}
                      className="mt-0.5 accent-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-[11px] uppercase tracking-wide text-text-soft/70">
                        {fieldLabel(entry.side)}
                      </span>
                      <span className="ml-1.5 break-words text-sm text-text">{entry.value}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-soft transition-colors hover:bg-background-elevated"
            onClick={onClose}
          >
            {scan.entries.length > 0 ? t('common.cancel') : t('common.close')}
          </button>
          {scan.entries.length > 0 && (
            <button
              type="button"
              disabled={selectedCount === 0 || applying}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-strong disabled:opacity-50"
              onClick={onApply}
            >
              {t('lists.acceptedAnswersBulkApply', { count: selectedCount })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
