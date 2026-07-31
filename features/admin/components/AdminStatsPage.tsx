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
import type { AdminUserRow, DeviceFormFactor, DevicePlatform } from '@/features/admin/types';
import { useSettingsLanguage } from '@/features/shared/languages/useSettingsLanguage';

type SortDirection = 'asc' | 'desc';
type UserSortKey =
  | 'lastSeenAt'
  | 'firstSeenAt'
  | 'reviewCount'
  | 'activeDays'
  | 'studySessions'
  | 'estActiveStudySeconds'
  | 'photoAnalyses'
  | 'gameScore'
  | 'deviceCount';
type ListSortKey = 'name' | 'subscriberCount' | 'activeSubscriberCount';

function SortHeader({
  active,
  direction,
  onClick,
  children,
  className = '',
  title,
}: {
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 hover:text-text ${className}`}
      onClick={onClick}
      title={title}
    >
      <span>{children}</span>
      <span className="text-[10px]">{active ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  );
}

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
  const [userSearch, setUserSearch] = useState('');
  const [userPlatformFilter, setUserPlatformFilter] = useState<DevicePlatform | 'all'>('all');
  const [userFormFactorFilter, setUserFormFactorFilter] = useState<DeviceFormFactor | 'all'>('all');
  const [userSort, setUserSort] = useState<{ key: UserSortKey; direction: SortDirection }>({
    key: 'lastSeenAt',
    direction: 'desc',
  });
  const [listSort, setListSort] = useState<{ key: ListSortKey; direction: SortDirection }>({
    key: 'subscriberCount',
    direction: 'desc',
  });

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
  const formatTokens = (tokens: number) => new Intl.NumberFormat().format(tokens);
  const formatUsd = (amount: number) =>
    `$${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: amount > 0 && amount < 0.01 ? 4 : 2,
    })}`;

  const platformLabel = (platform: DevicePlatform) => {
    switch (platform) {
      case 'ios':
        return t('adminStats.devicePlatformIos');
      case 'android':
        return t('adminStats.devicePlatformAndroid');
      case 'macos':
        return t('adminStats.devicePlatformMacos');
      case 'windows':
        return t('adminStats.devicePlatformWindows');
      case 'linux':
        return t('adminStats.devicePlatformLinux');
      case 'other':
        return t('adminStats.devicePlatformOther');
      case 'unknown':
        return t('adminStats.devicePlatformUnknown');
    }
  };

  const formFactorLabel = (formFactor: DeviceFormFactor) => {
    switch (formFactor) {
      case 'mobile':
        return t('adminStats.deviceFormMobile');
      case 'tablet':
        return t('adminStats.deviceFormTablet');
      case 'desktop':
        return t('adminStats.deviceFormDesktop');
      case 'unknown':
        return t('adminStats.deviceFormUnknown');
    }
  };

  const toggleUserSort = (key: UserSortKey) =>
    setUserSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));

  const toggleListSort = (key: ListSortKey) =>
    setListSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));

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
  const sortedTopLists = [...stats.content.topLists].sort((a, b) => {
    const av = a[listSort.key];
    const bv = b[listSort.key];
    const result =
      typeof av === 'string' && typeof bv === 'string'
        ? av.localeCompare(bv)
        : Number(av) - Number(bv);
    return listSort.direction === 'asc' ? result : -result;
  });
  const query = userSearch.trim().toLowerCase();
  const valueForUserSort = (user: AdminUserRow): number => {
    switch (userSort.key) {
      case 'lastSeenAt':
        return user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;
      case 'firstSeenAt':
        return user.firstSeenAt ? new Date(user.firstSeenAt).getTime() : 0;
      case 'reviewCount':
        return user.reviewCount;
      case 'activeDays':
        return user.activeDays;
      case 'studySessions':
        return user.studySessions;
      case 'estActiveStudySeconds':
        return user.estActiveStudySeconds;
      case 'photoAnalyses':
        return user.photoAnalyses;
      case 'gameScore':
        return user.gameScore;
      case 'deviceCount':
        return user.deviceCount;
    }
  };
  const visibleUsers = stats.users
    .filter((user) => {
      const matchesSearch =
        !query ||
        user.handle.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query);
      const matchesPlatform =
        userPlatformFilter === 'all' || user.lastDevicePlatform === userPlatformFilter;
      const matchesFormFactor =
        userFormFactorFilter === 'all' || user.lastDeviceFormFactor === userFormFactorFilter;
      return matchesSearch && matchesPlatform && matchesFormFactor;
    })
    .sort((a, b) => {
      const result = valueForUserSort(a) - valueForUserSort(b);
      return userSort.direction === 'asc' ? result : -result;
    });

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">{t('adminStats.title')}</h1>
          <div className="flex items-baseline gap-3 text-sm text-text-soft">
            <Link href="/admin/moderation" className="text-accent underline">
              {t('moderation.adminNavLink')}
            </Link>
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

        <Section title={t('adminStats.sectionDevices')} note={t('adminStats.devicesNote')}>
          <CardGrid>
            <StatCard
              label={t('adminStats.devicesActive30d')}
              value={stats.devices.activeDevices30d}
              highlight
              note={t('adminStats.devicesKnownNote', {
                known: stats.devices.knownDevices30d,
              })}
            />
            <StatCard label={t('adminStats.devicesIosUsers')} value={stats.devices.iosUsers30d} />
            <StatCard label={t('adminStats.devicesAndroidUsers')} value={stats.devices.androidUsers30d} />
            <StatCard label={t('adminStats.devicesMobileUsers')} value={stats.devices.mobileUsers30d} />
            <StatCard label={t('adminStats.devicesDesktopUsers')} value={stats.devices.desktopUsers30d} />
            <StatCard label={t('adminStats.devicesMultiUsers')} value={stats.devices.multiDeviceUsers30d} />
          </CardGrid>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border-subtle bg-background-elevated p-4">
              <h3 className="text-sm font-medium text-text-soft mb-2">
                {t('adminStats.devicesPlatformBreakdown')}
              </h3>
              <div className="space-y-1 text-sm">
                {stats.devices.platformBreakdown30d.map((bucket) => (
                  <div key={bucket.key} className="flex items-center justify-between gap-3">
                    <span>{platformLabel(bucket.key as DevicePlatform)}</span>
                    <span className="tabular-nums text-text-soft">{bucket.users}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border-subtle bg-background-elevated p-4">
              <h3 className="text-sm font-medium text-text-soft mb-2">
                {t('adminStats.devicesFormFactorBreakdown')}
              </h3>
              <div className="space-y-1 text-sm">
                {stats.devices.formFactorBreakdown30d.map((bucket) => (
                  <div key={bucket.key} className="flex items-center justify-between gap-3">
                    <span>{formFactorLabel(bucket.key as DeviceFormFactor)}</span>
                    <span className="tabular-nums text-text-soft">{bucket.users}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
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

        <Section
          title={t('adminStats.sectionWordChat')}
          note={t('adminStats.wordChatNote', {
            date: new Date(stats.wordChat.monthStart).toLocaleDateString(),
          })}
        >
          <CardGrid>
            <StatCard
              label={t('adminStats.wordChatCost')}
              value={formatUsd(stats.wordChat.estimatedCostUsd)}
              highlight
            />
            <StatCard
              label={t('adminStats.wordChatLimit')}
              value={formatUsd(stats.wordChat.monthlyLimitUsd)}
            />
            <StatCard
              label={t('adminStats.wordChatTokens')}
              value={formatTokens(stats.wordChat.inputTokens + stats.wordChat.outputTokens)}
            />
            <StatCard label={t('adminStats.wordChatCalls')} value={stats.wordChat.calls} />
            <StatCard
              label={t('adminStats.wordChatAccounts')}
              value={stats.wordChat.accounts.length}
            />
          </CardGrid>
          {stats.wordChat.accounts.length === 0 ? (
            <p className="text-sm text-text-soft">{t('adminStats.wordChatNoUsage')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border-subtle">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-soft bg-background-elevated">
                    <th className="px-3 py-2 font-medium">{t('adminStats.userHandle')}</th>
                    <th className="px-3 py-2 font-medium">{t('adminStats.wordChatAccountType')}</th>
                    <th className="px-3 py-2 font-medium text-right">{t('adminStats.wordChatCalls')}</th>
                    <th className="px-3 py-2 font-medium text-right">{t('adminStats.wordChatInputTokens')}</th>
                    <th className="px-3 py-2 font-medium text-right">{t('adminStats.wordChatOutputTokens')}</th>
                    <th className="px-3 py-2 font-medium text-right">{t('adminStats.wordChatTotalTokens')}</th>
                    <th className="px-3 py-2 font-medium text-right">{t('adminStats.wordChatEstimatedCost')}</th>
                    <th className="px-3 py-2 font-medium">{t('adminStats.userEmail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.wordChat.accounts.map((account) => (
                    <tr key={account.handle} className="border-t border-border-subtle">
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                        {account.handle}
                      </td>
                      <td className="px-3 py-2 text-text-soft whitespace-nowrap">
                        {t(
                          account.registered
                            ? 'adminStats.wordChatRegistered'
                            : 'adminStats.wordChatAnonymous'
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{account.calls}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatTokens(account.inputTokens)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatTokens(account.outputTokens)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatTokens(account.inputTokens + account.outputTokens)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatUsd(account.estimatedCostUsd)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {!account.email ? (
                          '—'
                        ) : revealedEmails.has(account.handle) ? (
                          <span className="select-all">{account.email}</span>
                        ) : (
                          <button
                            type="button"
                            className="text-accent underline"
                            onClick={() => revealEmail(account.handle)}
                          >
                            {t('adminStats.revealEmail')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                      <th className="px-3 py-2 font-medium">
                        <SortHeader
                          active={listSort.key === 'name'}
                          direction={listSort.direction}
                          onClick={() => toggleListSort('name')}
                        >
                          {t('adminStats.tableList')}
                        </SortHeader>
                      </th>
                      <th className="px-3 py-2 font-medium">{t('adminStats.tableLanguages')}</th>
                      <th className="px-3 py-2 font-medium text-right">
                        <SortHeader
                          active={listSort.key === 'subscriberCount'}
                          direction={listSort.direction}
                          onClick={() => toggleListSort('subscriberCount')}
                          className="justify-end"
                        >
                          {t('adminStats.tableSubscribers')}
                        </SortHeader>
                      </th>
                      <th
                        className="px-3 py-2 font-medium text-right"
                        title={t('adminStats.tableActiveSubscribersHint')}
                      >
                        <SortHeader
                          active={listSort.key === 'activeSubscriberCount'}
                          direction={listSort.direction}
                          onClick={() => toggleListSort('activeSubscriberCount')}
                          className="justify-end"
                          title={t('adminStats.tableActiveSubscribersHint')}
                        >
                          {t('adminStats.tableActiveSubscribers')}
                        </SortHeader>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTopLists.map((list) => (
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

        <Section
          title={t('adminStats.sectionUsers')}
          note={t('adminStats.usersNote')}
          // Full-bleed so the wide users table escapes the content column. The
          // 2rem inset is wider than any classic scrollbar, so `100vw` cannot
          // push the page into a horizontal scroll.
          className="relative left-1/2 w-[calc(100vw-2rem)] -translate-x-1/2"
        >
          {stats.users.length === 0 ? (
            <p className="text-sm text-text-soft">{t('adminStats.usersEmpty')}</p>
          ) : (
            <>
              <div className="grid gap-3 rounded-lg border border-border-subtle bg-background-elevated p-3 text-sm sm:grid-cols-3">
                <label className="space-y-1">
                  <span className="block text-xs text-text-soft">{t('adminStats.userFilterSearch')}</span>
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    className="w-full rounded-md border border-border-subtle bg-background px-3 py-2 text-text"
                    placeholder={t('adminStats.userFilterSearchPlaceholder')}
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs text-text-soft">{t('adminStats.userFilterPlatform')}</span>
                  <select
                    value={userPlatformFilter}
                    onChange={(event) => setUserPlatformFilter(event.target.value as DevicePlatform | 'all')}
                    className="w-full rounded-md border border-border-subtle bg-background px-3 py-2 text-text"
                  >
                    <option value="all">{t('adminStats.filterAll')}</option>
                    {(['ios', 'android', 'macos', 'windows', 'linux', 'other', 'unknown'] as DevicePlatform[]).map(
                      (platform) => (
                        <option key={platform} value={platform}>
                          {platformLabel(platform)}
                        </option>
                      )
                    )}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-xs text-text-soft">{t('adminStats.userFilterDeviceType')}</span>
                  <select
                    value={userFormFactorFilter}
                    onChange={(event) => setUserFormFactorFilter(event.target.value as DeviceFormFactor | 'all')}
                    className="w-full rounded-md border border-border-subtle bg-background px-3 py-2 text-text"
                  >
                    <option value="all">{t('adminStats.filterAll')}</option>
                    {(['mobile', 'tablet', 'desktop', 'unknown'] as DeviceFormFactor[]).map((formFactor) => (
                      <option key={formFactor} value={formFactor}>
                        {formFactorLabel(formFactor)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {visibleUsers.length === 0 ? (
                <p className="text-sm text-text-soft">{t('adminStats.usersFilteredEmpty')}</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border-subtle">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-soft bg-background-elevated">
                        <th className="px-3 py-2 font-medium">{t('adminStats.userHandle')}</th>
                        <th className="px-3 py-2 font-medium">
                          <SortHeader
                            active={userSort.key === 'lastSeenAt'}
                            direction={userSort.direction}
                            onClick={() => toggleUserSort('lastSeenAt')}
                          >
                            {t('adminStats.userLastSeen')}
                          </SortHeader>
                        </th>
                        <th className="px-3 py-2 font-medium">
                          <SortHeader
                            active={userSort.key === 'firstSeenAt'}
                            direction={userSort.direction}
                            onClick={() => toggleUserSort('firstSeenAt')}
                          >
                            {t('adminStats.userFirstSeen')}
                          </SortHeader>
                        </th>
                        <th className="px-3 py-2 font-medium">{t('adminStats.userDevice')}</th>
                        <th className="px-3 py-2 font-medium text-right">
                          <SortHeader
                            active={userSort.key === 'deviceCount'}
                            direction={userSort.direction}
                            onClick={() => toggleUserSort('deviceCount')}
                            className="justify-end"
                            title={t('adminStats.userDeviceCountHint')}
                          >
                            {t('adminStats.userDeviceCount')}
                          </SortHeader>
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          <SortHeader
                            active={userSort.key === 'gameScore'}
                            direction={userSort.direction}
                            onClick={() => toggleUserSort('gameScore')}
                            className="justify-end"
                            title={t('adminStats.userGameScoreHint')}
                          >
                            {t('adminStats.userGameScore')}
                          </SortHeader>
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          <SortHeader
                            active={userSort.key === 'reviewCount'}
                            direction={userSort.direction}
                            onClick={() => toggleUserSort('reviewCount')}
                            className="justify-end"
                            title={t('adminStats.userReviewsHint')}
                          >
                            {t('adminStats.userReviews')}
                          </SortHeader>
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          <SortHeader
                            active={userSort.key === 'activeDays'}
                            direction={userSort.direction}
                            onClick={() => toggleUserSort('activeDays')}
                            className="justify-end"
                            title={t('adminStats.userActiveDaysHint')}
                          >
                            {t('adminStats.userActiveDays')}
                          </SortHeader>
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          <SortHeader
                            active={userSort.key === 'studySessions'}
                            direction={userSort.direction}
                            onClick={() => toggleUserSort('studySessions')}
                            className="justify-end"
                            title={t('adminStats.userSessionsHint')}
                          >
                            {t('adminStats.userSessions')}
                          </SortHeader>
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          <SortHeader
                            active={userSort.key === 'estActiveStudySeconds'}
                            direction={userSort.direction}
                            onClick={() => toggleUserSort('estActiveStudySeconds')}
                            className="justify-end"
                            title={t('adminStats.userStudyTimeHint')}
                          >
                            {t('adminStats.userStudyTime')}
                          </SortHeader>
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          <SortHeader
                            active={userSort.key === 'photoAnalyses'}
                            direction={userSort.direction}
                            onClick={() => toggleUserSort('photoAnalyses')}
                            className="justify-end"
                          >
                            {t('adminStats.userPhotos')}
                          </SortHeader>
                        </th>
                        <th className="px-3 py-2 font-medium">{t('adminStats.userEmail')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleUsers.map((user) => {
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
                              <td className="px-3 py-2 text-text-soft whitespace-nowrap">
                                {platformLabel(user.lastDevicePlatform)} / {formFactorLabel(user.lastDeviceFormFactor)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{user.deviceCount}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{user.gameScore}</td>
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
                                <td colSpan={12} className="px-3 py-3">
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
            </>
          )}
        </Section>
      </div>
    </div>
  );
}
