'use client';

import { useI18n } from '@/components/I18nProvider';
import { CardGrid, Section, StatCard } from '@/components/stats/StatsPrimitives';
import type { UsageStats } from '@/features/admin/types';

/**
 * The mini-survey results block of the admin stats page.
 *
 * Its own file rather than one more `<Section>` on `AdminStatsPage`: two
 * tables, a dismissals bucket and a reveal-on-click e-mail column are enough
 * moving parts to read on their own, and the page was already sitting at its
 * AI-context budget.
 *
 * `revealedEmails`/`revealEmail` stay owned by the page, so one reveal covers
 * every table on it rather than each section keeping its own idea of which
 * addresses are showing. `formatDate` comes from there for the same reason:
 * one locale, decided once.
 */
export function AdminSurveysSection({
  surveys,
  revealedEmails,
  revealEmail,
  formatDate,
}: {
  surveys: UsageStats['surveys'];
  revealedEmails: ReadonlySet<string>;
  revealEmail: (handle: string) => void;
  formatDate: (iso: string | null) => string;
}) {
  const { t } = useI18n();
  return (
    <Section title={t('adminStats.sectionSurveys')} note={t('adminStats.surveysNote')}>
      <CardGrid>
        <StatCard
          label={t('adminStats.surveysTotalResponses')}
          value={surveys.summaries.reduce((total, s) => total + s.totalAnswered, 0)}
          highlight
        />
        <StatCard
          label={t('adminStats.surveysFreeTextCount')}
          value={surveys.freeTextResponses.length}
        />
      </CardGrid>
      {surveys.summaries.length === 0 ? (
        <p className="text-sm text-text-soft">{t('adminStats.surveysEmpty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-soft bg-background-elevated">
                <th className="px-3 py-2 font-medium">{t('adminStats.surveyId')}</th>
                <th className="px-3 py-2 font-medium">{t('adminStats.surveyOption')}</th>
                <th className="px-3 py-2 font-medium text-right">
                  {t('adminStats.surveyResponses')}
                </th>
              </tr>
            </thead>
            <tbody>
              {surveys.summaries.flatMap((summary) => [
                ...summary.options.map((option) => (
                  <tr key={`${summary.surveyId}:${option.optionId}`} className="border-t border-border-subtle">
                    <td className="px-3 py-2 font-mono text-[12px]">{summary.surveyId}</td>
                    <td className="px-3 py-2">{option.optionId}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{option.responses}</td>
                  </tr>
                )),
                <tr key={`${summary.surveyId}:dismissed`} className="border-t border-border-subtle text-text-soft">
                  <td className="px-3 py-2 font-mono text-[12px]">{summary.surveyId}</td>
                  <td className="px-3 py-2">{t('adminStats.surveyDismissedOption')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{summary.totalDismissed}</td>
                </tr>,
              ])}
            </tbody>
          </table>
        </div>
      )}
      {surveys.freeTextResponses.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium text-text-soft">
            {t('adminStats.surveyFreeTextTitle')}
          </h3>
          <div className="overflow-x-auto rounded-lg border border-border-subtle">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-soft bg-background-elevated">
                  <th className="px-3 py-2 font-medium">{t('adminStats.surveyId')}</th>
                  <th className="px-3 py-2 font-medium">{t('adminStats.surveyOption')}</th>
                  <th className="px-3 py-2 font-medium">{t('adminStats.surveyFreeText')}</th>
                  <th className="px-3 py-2 font-medium">{t('adminStats.userHandle')}</th>
                  <th className="px-3 py-2 font-medium text-right">
                    {t('adminStats.surveyRespondedAt')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {surveys.freeTextResponses.map((row, index) => (
                  <tr key={`${row.handle}:${row.surveyId}:${index}`} className="border-t border-border-subtle">
                    <td className="px-3 py-2 font-mono text-[12px]">{row.surveyId}</td>
                    <td className="px-3 py-2">{row.optionId}</td>
                    <td className="px-3 py-2 max-w-[420px] whitespace-pre-wrap">{row.freeText}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {!row.email ? (
                        '—'
                      ) : revealedEmails.has(row.handle) ? (
                        <span className="select-all">{row.email}</span>
                      ) : (
                        <button
                          type="button"
                          className="text-accent underline"
                          onClick={() => revealEmail(row.handle)}
                        >
                          {t('adminStats.revealEmail')}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-text-soft whitespace-nowrap">
                      {formatDate(row.respondedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Section>
  );
}
