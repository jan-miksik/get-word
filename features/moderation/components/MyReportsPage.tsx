'use client';

import { useEffect, useState } from 'react';
import { PlatformLink as Link } from '@/packages/product/shared/platform/navigation';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { listsApiFetch } from '@/features/lists/api';
import { useSettingsLanguage } from '@/features/shared/languages/useSettingsLanguage';
import type {
  ContentReportReason,
  ModerationDecisionCode,
  MyContentReportRow,
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

const DECISION_KEYS: Record<ModerationDecisionCode, I18nKey> = {
  no_violation: 'moderation.decisionNoViolation',
  sexual_content: 'moderation.reasonSexual',
  hate_or_harassment: 'moderation.reasonHate',
  violence_or_danger: 'moderation.reasonViolence',
  illegal_content: 'moderation.reasonIllegal',
  spam_or_misleading: 'moderation.reasonSpam',
  copyright: 'moderation.reasonCopyright',
  other_policy_violation: 'moderation.decisionOtherViolation',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; reports: MyContentReportRow[] };

export function MyReportsPage() {
  const language = useSettingsLanguage();
  return (
    <I18nProvider language={language}>
      <MyReportsContent />
    </I18nProvider>
  );
}

function MyReportsContent() {
  const { t, language } = useI18n();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void listsApiFetch('/api/moderation/reports', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = await response.json() as { reports?: MyContentReportRow[] };
        if (active) setState({ status: 'ready', reports: body.reports ?? [] });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-text">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <Link href="/lists" className="text-sm text-accent underline underline-offset-2">
            ← {t('moderation.myReportsBack')}
          </Link>
          <h1 className="mt-4 text-2xl font-semibold">{t('moderation.myReportsTitle')}</h1>
          <p className="mt-1 text-sm text-text-soft">{t('moderation.myReportsSubtitle')}</p>
        </header>

        {state.status === 'loading' ? <p className="text-text-soft">{t('app.loading')}</p> : null}
        {state.status === 'error' ? (
          <p className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm">
            {t('moderation.myReportsLoadFailed')}
          </p>
        ) : null}
        {state.status === 'ready' && state.reports.length === 0 ? (
          <p className="rounded-xl border border-border-subtle bg-background-elevated p-5 text-sm text-text-soft">
            {t('moderation.myReportsEmpty')}
          </p>
        ) : null}
        {state.status === 'ready' ? (
          <div className="space-y-4">
            {state.reports.map((report) => {
              const pending = report.status === 'pending' || report.status === 'reviewing';
              return (
                <article key={report.id} className="rounded-xl border border-border-subtle bg-background-elevated p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{report.listName}</h2>
                      <p className="mt-1 text-xs text-text-soft">
                        {t('moderation.myReportsReportedAs', { reason: t(REASON_KEYS[report.reason]) })}
                        {' · '}
                        {new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(report.createdAt))}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      pending
                        ? 'bg-accent/10 text-accent'
                        : report.status === 'resolved'
                          ? 'bg-danger/10 text-danger'
                          : 'bg-done/10 text-done'
                    }`}>
                      {pending
                        ? t('moderation.statusPending')
                        : report.status === 'resolved'
                          ? t('moderation.statusActionTaken')
                          : t('moderation.statusNoViolation')}
                    </span>
                  </div>

                  <div className="mt-4 rounded-lg border border-border-subtle bg-background p-4 text-sm">
                    {pending ? (
                      <p>{t('moderation.myReportsPendingBody')}</p>
                    ) : report.status === 'dismissed' ? (
                      <p>{t('moderation.myReportsNoViolationBody')}</p>
                    ) : (
                      <p>
                        {t('moderation.myReportsActionBody', {
                          reason: report.decisionCode
                            ? t(DECISION_KEYS[report.decisionCode])
                            : t('moderation.decisionOtherViolation'),
                        })}
                      </p>
                    )}
                    {report.publicNote ? (
                      <p className="mt-3 border-t border-border-subtle pt-3 text-text-soft">
                        {report.publicNote}
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        <p className="text-sm text-text-soft">
          {t('moderation.myReportsDisagree')}{' '}
          <a className="text-accent underline underline-offset-2" href="mailto:support@getword.app">
            support@getword.app
          </a>
        </p>
      </div>
    </main>
  );
}
