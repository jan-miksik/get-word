'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { listsApiFetch } from '@/features/lists/api';
import type { WordList } from '@/features/lists/types';
import {
  CONTENT_REPORT_REASON_VALUES,
  type ContentReportReason,
} from '@/features/moderation/types';
import type { I18nKey } from '@/lib/i18n/locales/en';

const REASON_KEYS: Record<ContentReportReason, I18nKey> = {
  sexual_content: 'moderation.reasonSexual',
  hate_or_harassment: 'moderation.reasonHate',
  violence_or_danger: 'moderation.reasonViolence',
  illegal_content: 'moderation.reasonIllegal',
  spam_or_misleading: 'moderation.reasonSpam',
  copyright: 'moderation.reasonCopyright',
  other: 'moderation.reasonOther',
};

type ReportResult = {
  blocked: boolean;
  hiddenPendingReview: boolean;
};

export function ReportContentDialog({
  list,
  onClose,
  onContentHidden,
}: {
  list: WordList;
  onClose: () => void;
  onContentHidden: (listId: string) => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState<ContentReportReason>('spam_or_misleading');
  const [details, setDetails] = useState('');
  const [blockAuthor, setBlockAuthor] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const canBlockAuthor = Boolean(list.ownerId && !list.isCommon && !list.isRecommended);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await listsApiFetch('/api/moderation/reports', {
        method: 'POST',
        body: JSON.stringify({ listId: list.id, reason, details, blockAuthor }),
      });
      if (!response.ok) throw new Error();
      const body = await response.json() as ReportResult;
      setResult(body);
    } catch {
      setError(t('moderation.reportFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  function closeAfterSuccess() {
    if (result?.blocked || result?.hiddenPendingReview) onContentHidden(list.id);
    onClose();
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={result ? closeAfterSuccess : onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border-subtle bg-background p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-content-title"
        onClick={(event) => event.stopPropagation()}
      >
        {result ? (
          <>
            <h2 id="report-content-title" className="text-lg font-semibold text-text">
              {t('moderation.reportSuccessTitle')}
            </h2>
            <p className="mt-2 text-sm text-text-soft">
              {result.blocked
                ? t('moderation.reportSuccessBlocked')
                : result.hiddenPendingReview
                  ? t('moderation.reportSuccessHidden')
                  : t('moderation.reportSuccessReceived')}
            </p>
            <div className="mt-5 flex justify-end">
              <Link
                href="/reports"
                className="mr-2 rounded-lg border border-border-subtle px-4 py-2 text-sm text-text"
              >
                {t('moderation.viewMyReports')}
              </Link>
              <button
                type="button"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background"
                onClick={closeAfterSuccess}
              >
                {t('common.done')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="report-content-title" className="text-lg font-semibold text-text">
              {t('moderation.reportTitle')}
            </h2>
            <p className="mt-1 text-sm text-text-soft">
              {t('moderation.reportIntro', { name: list.name })}
            </p>

            <label className="mt-4 grid gap-1.5 text-sm">
              <span className="font-medium text-text">{t('moderation.reasonLabel')}</span>
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value as ContentReportReason)}
                className="rounded-lg border border-border-subtle bg-background-elevated px-3 py-2 text-text outline-none focus:border-accent"
              >
                {CONTENT_REPORT_REASON_VALUES.map((value) => (
                  <option key={value} value={value}>{t(REASON_KEYS[value])}</option>
                ))}
              </select>
            </label>

            <label className="mt-4 grid gap-1.5 text-sm">
              <span className="font-medium text-text">{t('moderation.detailsLabel')}</span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                maxLength={1000}
                rows={4}
                className="resize-none rounded-lg border border-border-subtle bg-background-elevated px-3 py-2 text-text outline-none focus:border-accent"
                placeholder={t('moderation.detailsPlaceholder')}
              />
            </label>

            {canBlockAuthor ? (
              <label className="mt-4 flex items-start gap-2 rounded-lg border border-border-subtle bg-background-elevated p-3 text-sm text-text">
                <input
                  type="checkbox"
                  checked={blockAuthor}
                  onChange={(event) => setBlockAuthor(event.target.checked)}
                  className="mt-0.5 size-4 accent-accent"
                />
                <span>
                  <span className="block font-medium">{t('moderation.blockWithReport')}</span>
                  <span className="block text-xs text-text-soft">{t('moderation.blockWithReportHint')}</span>
                </span>
              </label>
            ) : null}

            {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text"
                onClick={onClose}
                disabled={submitting}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                onClick={() => void submit()}
                disabled={submitting}
              >
                {submitting ? t('moderation.reporting') : t('moderation.submitReport')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
