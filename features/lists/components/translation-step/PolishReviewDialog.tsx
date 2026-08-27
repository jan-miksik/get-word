'use client';

import { useI18n } from '@/components/I18nProvider';
import type { PolishFixCode, PolishWarningCode } from '@/lib/formatting-polish';
import type { PolishField, PolishScan } from './types';

interface PolishReviewDialogProps {
  scan: PolishScan;
  selected: ReadonlySet<string>;
  fieldLabel: (field: PolishField) => string;
  onToggle: (key: string) => void;
  onApply: () => void;
  onClose: () => void;
}

function describeFix(t: ReturnType<typeof useI18n>['t'], code: PolishFixCode) {
  switch (code) {
    case 'trim':
      return t('lists.polishFixTrim');
    case 'collapse_spaces':
      return t('lists.polishFixCollapse');
    case 'space_before_punctuation':
      return t('lists.polishFixSpaceBeforePunct');
    case 'capitalize_sentence':
      return t('lists.polishFixCapitalize');
    case 'add_final_period':
      return t('lists.polishFixPeriod');
  }
}

function describeWarning(t: ReturnType<typeof useI18n>['t'], code: PolishWarningCode) {
  switch (code) {
    case 'maybe_question':
      return t('lists.polishWarningQuestion');
    case 'maybe_exclamation':
      return t('lists.polishWarningExclamation');
  }
}

export function PolishReviewDialog({
  scan,
  selected,
  fieldLabel,
  onToggle,
  onApply,
  onClose,
}: PolishReviewDialogProps) {
  const { t } = useI18n();
  const selectedCount = scan.changes.filter((change) => selected.has(change.key)).length;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border-subtle bg-background p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-text">{t('lists.polishTitle')}</h2>
        <p className="mt-1 text-sm text-text-soft">{t('lists.polishHint')}</p>

        <div className="mt-4 flex-1 overflow-y-auto">
          {scan.changes.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-text-soft">
                {t('lists.polishSuggestedFixes', { count: scan.changes.length })}
              </div>
              <div className="mt-2 space-y-1.5">
                {scan.changes.map((change) => (
                  <label
                    key={change.key}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-background-elevated"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(change.key)}
                      onChange={() => onToggle(change.key)}
                      className="mt-1 accent-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-[11px] uppercase tracking-wide text-text-soft/70">
                        {fieldLabel(change.field)}
                      </span>
                      <span className="mt-0.5 block break-words text-sm">
                        <span className="text-text-soft line-through">{change.before}</span>
                        <span className="text-text-soft"> → </span>
                        <span className="text-text">{change.after}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {change.fixCodes.map((code) => (
                          <span
                            key={code}
                            className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent"
                          >
                            {describeFix(t, code)}
                          </span>
                        ))}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {scan.warnings.length > 0 && (
            <div className={scan.changes.length > 0 ? 'mt-4' : ''}>
              <div className="text-xs font-medium uppercase tracking-wide text-text-soft">
                {t('lists.polishWarnings', { count: scan.warnings.length })}
              </div>
              <div className="mt-2 space-y-1.5">
                {scan.warnings.map((warning) => (
                  <div
                    key={warning.key}
                    className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600"
                  >
                    <span className="text-[11px] uppercase tracking-wide opacity-80">
                      {fieldLabel(warning.field)}
                    </span>
                    <span className="ml-1.5 break-words text-text-soft">“{warning.text}”</span>
                    <div className="mt-0.5">{describeWarning(t, warning.code)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-soft transition-colors hover:bg-background-elevated"
            onClick={onClose}
          >
            {scan.changes.length > 0 ? t('common.cancel') : t('common.close')}
          </button>
          {scan.changes.length > 0 && (
            <button
              type="button"
              disabled={selectedCount === 0}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-strong disabled:opacity-50"
              onClick={onApply}
            >
              {t('lists.polishApply', { count: selectedCount })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
