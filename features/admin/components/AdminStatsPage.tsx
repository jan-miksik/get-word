'use client';

import Link from 'next/link';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import {
  ActivityWindowToggle,
  CardGrid,
  Section,
  StatCard,
  TrendBars,
} from '@/components/stats/StatsPrimitives';
import { useAdminStats } from '@/features/admin/client/useAdminStats';
import { useSettingsLanguage } from '@/features/shared/languages/useSettingsLanguage';

export function AdminStatsPage() {
  const settingsLanguage = useSettingsLanguage();

  return (
    <I18nProvider language={settingsLanguage}>
      <AdminStatsContent />
    </I18nProvider>
  );
}

function AdminStatsContent() {
  const { t } = useI18n();
  const { state, activityWindow, reload, changeActivityWindow } = useAdminStats();

  if (state.status !== 'ready') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-text">
        <div className="text-center text-text-soft space-y-3 px-4">
          {state.status === 'loading' && <p>{t('app.loading')}</p>}
          {state.status === 'unauthorized' && (
            <>
              <p>{t('adminStats.signInRequired')}</p>
              <Link href="/login" className="inline-block text-accent underline">
                {t('adminStats.signInLink')}
              </Link>
            </>
          )}
          {state.status === 'forbidden' && <p>{t('adminStats.forbidden')}</p>}
          {state.status === 'error' && (
            <>
              <p>{t('adminStats.error')}</p>
              <button
                type="button"
                className="inline-block text-accent underline"
                onClick={reload}
              >
                {t('adminStats.retry')}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const { stats } = state;
  const retentionCards = [
    { label: t('adminStats.returnedAfter1'), bucket: stats.retention.d1 },
    { label: t('adminStats.returnedAfter7'), bucket: stats.retention.d7 },
    { label: t('adminStats.returnedAfter30'), bucket: stats.retention.d30 },
  ];
  const isCalendarActivity = stats.activity.window === 'calendar';

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">{t('adminStats.title')}</h1>
          <div className="flex items-baseline gap-3 text-sm text-text-soft">
            <Link href="/admin/schools" className="text-accent underline">
              {t('adminStats.schoolsLink')}
            </Link>
            <span>
              {t('adminStats.generatedAt', {
                time: new Date(stats.generatedAt).toLocaleString(),
              })}
            </span>
            <button
              type="button"
              className="text-accent underline"
              onClick={reload}
            >
              {t('adminStats.refresh')}
            </button>
          </div>
        </header>

        <Section title={t('adminStats.sectionRegistrations')}>
          <CardGrid>
            <StatCard label={t('adminStats.registeredTotal')} value={stats.registrations.total} highlight />
            <StatCard label={t('adminStats.providerEmail')} value={stats.registrations.email} />
            <StatCard label={t('adminStats.providerGoogle')} value={stats.registrations.google} />
            <StatCard label={t('adminStats.providerOther')} value={stats.registrations.other} />
            <StatCard
              label={t('adminStats.anonymous')}
              value={stats.registrations.anonymous}
              note={t('adminStats.anonymousNote')}
            />
          </CardGrid>
          <TrendBars
            title={t('adminStats.registrationsWeekly')}
            partialLabel={t('adminStats.partialWeek')}
            emptyLabel={t('adminStats.noData')}
            bars={stats.registrations.weekly.map((week) => ({
              weekStart: week.weekStart,
              value: week.count,
              partial: week.partial,
            }))}
          />
        </Section>

        <Section
          title={t('adminStats.sectionActivity')}
          note={isCalendarActivity ? t('adminStats.activityNoteCalendar') : t('adminStats.activityNoteRolling')}
          actions={
            <ActivityWindowToggle
              value={activityWindow}
              onChange={changeActivityWindow}
              rollingLabel={t('adminStats.activityWindowRolling')}
              calendarLabel={t('adminStats.activityWindowCalendar')}
              ariaLabel={t('adminStats.activityWindowAria')}
            />
          }
        >
          <CardGrid>
            <StatCard
              label={t(isCalendarActivity ? 'adminStats.dauCalendar' : 'adminStats.dau')}
              value={stats.activity.dau}
            />
            <StatCard
              label={t(isCalendarActivity ? 'adminStats.wauCalendar' : 'adminStats.wau')}
              value={stats.activity.wau}
            />
            <StatCard
              label={t(isCalendarActivity ? 'adminStats.mauCalendar' : 'adminStats.mau')}
              value={stats.activity.mau}
              highlight
              note={t('adminStats.mauSplit', {
                registered: stats.activity.mauRegistered,
                anonymous: stats.activity.mauAnonymous,
              })}
            />
            <StatCard
              label={t(isCalendarActivity ? 'adminStats.yauCalendar' : 'adminStats.yau')}
              value={stats.activity.yau}
              note={t('adminStats.yauSplit', {
                registered: stats.activity.yauRegistered,
                anonymous: stats.activity.yauAnonymous,
              })}
            />
          </CardGrid>
        </Section>

        <Section title={t('adminStats.sectionStudy')}>
          <CardGrid>
            <StatCard label={t('adminStats.known')} value={stats.study.known30d} />
            <StatCard label={t('adminStats.reallyKnown')} value={stats.study.reallyKnown30d} />
            <StatCard label={t('adminStats.unknown')} value={stats.study.unknown30d} />
          </CardGrid>
          <p className="text-sm text-text-soft">
            {t('adminStats.studySummary', {
              studied: stats.study.studyingUsers30d,
              mau: stats.activity.mau,
            })}
          </p>
          <TrendBars
            title={t('adminStats.studyWeekly')}
            partialLabel={t('adminStats.partialWeek')}
            emptyLabel={t('adminStats.noData')}
            bars={stats.study.weekly.map((week) => ({
              weekStart: week.weekStart,
              value: week.reviews,
              sublabel: String(week.activeUsers),
              partial: week.partial,
            }))}
          />
        </Section>

        <Section title={t('adminStats.sectionContent')}>
          <CardGrid>
            <StatCard label={t('adminStats.totalLists')} value={stats.content.totalLists} />
            <StatCard label={t('adminStats.publicLists')} value={stats.content.publicLists} />
            <StatCard label={t('adminStats.subscriptions')} value={stats.content.totalSubscriptions} />
          </CardGrid>
          {stats.content.topLists.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-text-soft mb-2">{t('adminStats.topLists')}</h3>
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-soft bg-background-elevated">
                      <th className="px-3 py-2 font-medium">{t('adminStats.tableList')}</th>
                      <th className="px-3 py-2 font-medium">{t('adminStats.tableLanguages')}</th>
                      <th className="px-3 py-2 font-medium text-right">{t('adminStats.tableSubscribers')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.content.topLists.map((list) => (
                      <tr key={list.id} className="border-t border-border-subtle">
                        <td className="px-3 py-2">{list.name}</td>
                        <td className="px-3 py-2 text-text-soft whitespace-nowrap">
                          {list.languageFrom} → {list.languageTo}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{list.subscriberCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>

        <Section title={t('adminStats.sectionRetention')} note={t('adminStats.retentionNote')}>
          <CardGrid>
            {retentionCards.map(({ label, bucket }) => (
              <StatCard
                key={label}
                label={label}
                value={
                  bucket.eligible > 0
                    ? `${Math.round((bucket.returned / bucket.eligible) * 100)}%`
                    : '—'
                }
                note={t('adminStats.retentionOf', {
                  returned: bucket.returned,
                  eligible: bucket.eligible,
                })}
              />
            ))}
          </CardGrid>
        </Section>
      </div>
    </div>
  );
}
