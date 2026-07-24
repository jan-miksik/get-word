'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import {
  ActivityHeatmap,
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
  const [revealedEmails, setRevealedEmails] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const revealEmail = (handle: string) =>
    setRevealedEmails((prev) => new Set(prev).add(handle));

  const toggleRow = (handle: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString() : '—';

  const formatStudyTime = (seconds: number) => {
    if (!seconds) return '—';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours} h ${minutes % 60} min`;
  };

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

        <Section title={t('adminStats.sectionHeatmap')} note={t('adminStats.heatmapNote')}>
          <ActivityHeatmap
            days={stats.activityHeatmap.map((day) => ({ date: day.date, value: day.activeUsers }))}
            endDate={new Date(stats.generatedAt)}
            emptyLabel={t('adminStats.noData')}
            lessLabel={t('adminStats.heatmapLess')}
            moreLabel={t('adminStats.heatmapMore')}
            formatTooltip={(date, value) => t('adminStats.heatmapTooltip', { date, count: value })}
          />
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

        <Section
          title={t('adminStats.sectionPhoto')}
          note={t('adminStats.photoTrackedSince', {
            date: new Date(stats.photo.trackedSince).toLocaleDateString(),
          })}
        >
          <CardGrid>
            <StatCard label={t('adminStats.photoTotal')} value={stats.photo.totalAnalyses} highlight />
            <StatCard label={t('adminStats.photoUsers')} value={stats.photo.users} />
            <StatCard label={t('adminStats.photoRepeatUsers')} value={stats.photo.repeatUsers} />
            <StatCard
              label={t('adminStats.photoRepeatRate')}
              value={`${Math.round(stats.photo.repeatRate * 100)}%`}
            />
          </CardGrid>
          <TrendBars
            title={t('adminStats.photoWeekly')}
            partialLabel={t('adminStats.partialWeek')}
            emptyLabel={t('adminStats.noData')}
            bars={stats.photo.weekly.map((week) => ({
              weekStart: week.weekStart,
              value: week.analyses,
              sublabel: String(week.users),
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
                      <th
                        className="px-3 py-2 font-medium text-right"
                        title={t('adminStats.tableActiveSubscribersHint')}
                      >
                        {t('adminStats.tableActiveSubscribers')}
                      </th>
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
                        <td className="px-3 py-2 text-right tabular-nums">{list.activeSubscriberCount}</td>
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

        <Section title={t('adminStats.sectionUsers')} note={t('adminStats.usersNote')}>
          {stats.users.length === 0 ? (
            <p className="text-sm text-text-soft">{t('adminStats.usersEmpty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border-subtle">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-soft bg-background-elevated">
                    <th className="px-3 py-2 font-medium">{t('adminStats.userHandle')}</th>
                    <th className="px-3 py-2 font-medium">{t('adminStats.userLastSeen')}</th>
                    <th className="px-3 py-2 font-medium">{t('adminStats.userFirstSeen')}</th>
                    <th className="px-3 py-2 font-medium text-right" title={t('adminStats.userReviewsHint')}>
                      {t('adminStats.userReviews')}
                    </th>
                    <th className="px-3 py-2 font-medium text-right" title={t('adminStats.userActiveDaysHint')}>
                      {t('adminStats.userActiveDays')}
                    </th>
                    <th className="px-3 py-2 font-medium text-right" title={t('adminStats.userSessionsHint')}>
                      {t('adminStats.userSessions')}
                    </th>
                    <th className="px-3 py-2 font-medium text-right" title={t('adminStats.userStudyTimeHint')}>
                      {t('adminStats.userStudyTime')}
                    </th>
                    <th className="px-3 py-2 font-medium text-right">{t('adminStats.userPhotos')}</th>
                    <th className="px-3 py-2 font-medium">{t('adminStats.userEmail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.users.map((user) => {
                    const expanded = expandedRows.has(user.handle);
                    return (
                      <Fragment key={user.handle}>
                        <tr className="border-t border-border-subtle">
                          <td className="px-3 py-2 whitespace-nowrap">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 font-mono text-xs text-text hover:text-accent"
                              onClick={() => toggleRow(user.handle)}
                              aria-expanded={expanded}
                              title={t('adminStats.userHeatmapToggle')}
                            >
                              <span className="text-text-soft">{expanded ? '▾' : '▸'}</span>
                              {user.handle}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-text-soft whitespace-nowrap">{formatDate(user.lastSeenAt)}</td>
                          <td className="px-3 py-2 text-text-soft whitespace-nowrap">{formatDate(user.firstSeenAt)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{user.reviewCount}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{user.activeDays}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{user.studySessions}</td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                            {formatStudyTime(user.estActiveStudySeconds)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{user.photoAnalyses}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {revealedEmails.has(user.handle) ? (
                              <span className="select-all">{user.email}</span>
                            ) : (
                              <button
                                type="button"
                                className="text-accent underline"
                                onClick={() => revealEmail(user.handle)}
                              >
                                {t('adminStats.revealEmail')}
                              </button>
                            )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-background-elevated/50">
                            <td colSpan={9} className="px-3 py-3">
                              <ActivityHeatmap
                                compact
                                days={user.dailyActivity.map((day) => ({ date: day.date, value: day.count }))}
                                endDate={new Date(stats.generatedAt)}
                                emptyLabel={t('adminStats.userHeatmapEmpty')}
                                lessLabel={t('adminStats.heatmapLess')}
                                moreLabel={t('adminStats.heatmapMore')}
                                formatTooltip={(date, value) =>
                                  t('adminStats.userHeatmapTooltip', { date, count: value })
                                }
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
