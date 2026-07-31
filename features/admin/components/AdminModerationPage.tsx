'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { useSettingsLanguage } from '@/features/shared/languages/useSettingsLanguage';
import {
  MODERATION_VIOLATION_DECISION_VALUES,
  type ContentReportReason,
  type ModerationDecisionCode,
  type ModerationReportRow,
} from '@/features/moderation/types';
import type { I18nKey } from '@/lib/i18n/locales/en';
import { apiFetch } from '@/features/shared/http/api-runtime';

type LoadState =
  | { status: 'loading' }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | { status: 'ready'; reports: ModerationReportRow[] };

const REASON_KEYS: Record<ContentReportReason, Parameters<ReturnType<typeof useI18n>['t']>[0]> = {
  sexual_content: 'moderation.reasonSexual',
  hate_or_harassment: 'moderation.reasonHate',
  violence_or_danger: 'moderation.reasonViolence',
  illegal_content: 'moderation.reasonIllegal',
  spam_or_misleading: 'moderation.reasonSpam',
  copyright: 'moderation.reasonCopyright',
  other: 'moderation.reasonOther',
};

const DECISION_KEYS: Record<Exclude<ModerationDecisionCode, 'no_violation'>, I18nKey> = {
  sexual_content: 'moderation.reasonSexual',
  hate_or_harassment: 'moderation.reasonHate',
  violence_or_danger: 'moderation.reasonViolence',
  illegal_content: 'moderation.reasonIllegal',
  spam_or_misleading: 'moderation.reasonSpam',
  copyright: 'moderation.reasonCopyright',
  other_policy_violation: 'moderation.decisionOtherViolation',
};

function defaultDecision(report: ModerationReportRow): Exclude<ModerationDecisionCode, 'no_violation'> {
  return report.reason === 'other' ? 'other_policy_violation' : report.reason;
}

export function AdminModerationPage() {
  const settingsLanguage = useSettingsLanguage();
  return (
    <I18nProvider language={settingsLanguage}>
      <AdminModerationContent />
    </I18nProvider>
  );
}

function AdminModerationContent() {
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showAll, setShowAll] = useState(false);
  const [internalNotes, setInternalNotes] = useState<Record<string, string>>({});
  const [publicNotes, setPublicNotes] = useState<Record<string, string>>({});
  const [decisionCodes, setDecisionCodes] = useState<Record<string, Exclude<ModerationDecisionCode, 'no_violation'>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchReports = useCallback(async (): Promise<LoadState> => {
    try {
      const response = await apiFetch(`/api/admin/moderation/reports?status=${showAll ? 'all' : 'pending'}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 401) return { status: 'unauthorized' };
      if (response.status === 403) return { status: 'forbidden' };
      if (!response.ok) return { status: 'error' };
      const body = await response.json() as { reports?: ModerationReportRow[] };
      return { status: 'ready', reports: body.reports ?? [] };
    } catch {
      return { status: 'error' };
    }
  }, [showAll]);

  useEffect(() => {
    let active = true;
    void fetchReports().then((nextState) => {
      if (active) setState(nextState);
    });
    return () => {
      active = false;
    };
  }, [fetchReports]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    void fetchReports().then(setState);
  }, [fetchReports]);

  async function moderate(report: ModerationReportRow, action: 'dismiss' | 'restrict') {
    if (action === 'restrict' && !window.confirm(t('moderation.adminRestrictConfirm'))) return;
    setBusyId(report.id);
    try {
      const response = await apiFetch(`/api/admin/moderation/reports/${report.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          decisionCode: action === 'restrict'
            ? decisionCodes[report.id] ?? defaultDecision(report)
            : 'no_violation',
          publicNote: publicNotes[report.id] ?? '',
          internalNote: internalNotes[report.id] ?? '',
        }),
      });
      if (!response.ok) throw new Error();
      reload();
    } catch {
      window.alert(t('moderation.adminActionFailed'));
    } finally {
      setBusyId(null);
    }
  }

  if (state.status !== 'ready') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-text-soft">
        {state.status === 'loading' && <p>{t('app.loading')}</p>}
        {state.status === 'unauthorized' && <p>{t('moderation.adminSignIn')}</p>}
        {state.status === 'forbidden' && <p>{t('moderation.adminForbidden')}</p>}
        {state.status === 'error' && <p>{t('moderation.adminLoadFailed')}</p>}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t('moderation.adminTitle')}</h1>
            <p className="mt-1 text-sm text-text-soft">{t('moderation.adminSubtitle')}</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-text-soft">
              <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
              {t('moderation.adminShowAll')}
            </label>
            <Link href="/admin/stats" className="text-accent underline">
              {t('moderation.adminBack')}
            </Link>
          </div>
        </header>

        {state.reports.length === 0 ? (
          <p className="rounded-xl border border-border-subtle bg-background-elevated p-5 text-sm text-text-soft">
            {t('moderation.adminEmpty')}
          </p>
        ) : (
          <div className="space-y-4">
            {state.reports.map((report) => (
              <article key={report.id} className="rounded-xl border border-border-subtle bg-background-elevated p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{report.currentListName ?? report.listNameSnapshot}</h2>
                    <p className="text-xs text-text-soft">
                      {t(REASON_KEYS[report.reason])} · {new Date(report.createdAt).toLocaleString()}
                      {report.ownerHandle ? ` · ${report.ownerHandle}` : ''}
                    </p>
                  </div>
                  <span className="rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-soft">
                    {report.status}
                  </span>
                </div>
                {(report.details || report.listDescriptionSnapshot) && (
                  <div className="mt-3 space-y-2 text-sm">
                    {report.details && <p><strong>{t('moderation.adminUserNote')}:</strong> {report.details}</p>}
                    {report.listDescriptionSnapshot && <p className="text-text-soft">{report.listDescriptionSnapshot}</p>}
                  </div>
                )}
                {report.contentExcerpt && (
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs text-text-soft">
                    {report.contentExcerpt}
                  </pre>
                )}
                {(report.status === 'pending' || report.status === 'reviewing') && (
                  <div className="mt-4 space-y-3">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-text">{t('moderation.adminDecisionReason')}</span>
                      <select
                        value={decisionCodes[report.id] ?? defaultDecision(report)}
                        onChange={(event) => setDecisionCodes((current) => ({
                          ...current,
                          [report.id]: event.target.value as Exclude<ModerationDecisionCode, 'no_violation'>,
                        }))}
                        className="rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                      >
                        {MODERATION_VIOLATION_DECISION_VALUES.map((decision) => (
                          <option key={decision} value={decision}>{t(DECISION_KEYS[decision])}</option>
                        ))}
                      </select>
                    </label>
                    <textarea
                      value={publicNotes[report.id] ?? ''}
                      onChange={(event) => setPublicNotes((current) => ({ ...current, [report.id]: event.target.value }))}
                      maxLength={1000}
                      rows={2}
                      className="w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                      placeholder={t('moderation.adminPublicNote')}
                    />
                    <textarea
                      value={internalNotes[report.id] ?? ''}
                      onChange={(event) => setInternalNotes((current) => ({ ...current, [report.id]: event.target.value }))}
                      maxLength={1000}
                      rows={2}
                      className="w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                      placeholder={t('moderation.adminModeratorNote')}
                    />
                    <p className="text-xs text-text-soft">{t('moderation.adminDecisionHint')}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={busyId === report.id}
                        className="rounded-lg border border-border-subtle px-3 py-2 text-sm hover:bg-background"
                        onClick={() => void moderate(report, 'dismiss')}
                      >
                        {t('moderation.adminDismiss')}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === report.id}
                        className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white hover:bg-danger/90"
                        onClick={() => void moderate(report, 'restrict')}
                      >
                        {t('moderation.adminRestrict')}
                      </button>
                    </div>
                  </div>
                )}
                {report.decisionCode ? (
                  <div className="mt-4 rounded-lg border border-border-subtle bg-background p-3 text-sm">
                    <p className="font-medium">
                      {report.decisionCode === 'no_violation'
                        ? t('moderation.decisionNoViolation')
                        : t(DECISION_KEYS[report.decisionCode])}
                    </p>
                    {report.publicNote ? <p className="mt-1 text-text-soft">{report.publicNote}</p> : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
