'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { useListsSettingsLanguage } from '@/features/lists/hooks/useListsSettingsLanguage';
import type { ActivityWindow, UsageStats } from '@/lib/db/queries/usage-stats';

export default function AdminStatsPage() {
  const settingsLanguage = useListsSettingsLanguage();

  return (
    <I18nProvider language={settingsLanguage}>
      <AdminStatsContent />
    </I18nProvider>
  );
}

type LoadState =
  | { status: 'loading' }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | { status: 'ready'; stats: UsageStats };

function AdminStatsContent() {
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [activityWindow, setActivityWindow] = useState<ActivityWindow>('rolling');

  // The initial state is already 'loading'; only retry/refresh resets it.
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ activityWindow });
      const response = await fetch(`/api/admin/stats?${params}`, { credentials: 'same-origin' });
      if (response.status === 401) return setState({ status: 'unauthorized' });
      if (response.status === 403) return setState({ status: 'forbidden' });
      if (!response.ok) return setState({ status: 'error' });
      setState({ status: 'ready', stats: (await response.json()) as UsageStats });
    } catch {
      setState({ status: 'error' });
    }
  }, [activityWindow]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    void load();
  }, [load]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

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
              onChange={(value) => {
                setActivityWindow(value);
                setState({ status: 'loading' });
              }}
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

function Section({
  title,
  note,
  actions,
  children,
}: {
  title: string;
  note?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {note && <p className="text-xs text-text-soft mt-1">{note}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{children}</div>;
}

function StatCard({
  label,
  value,
  note,
  highlight,
}: {
  label: string;
  value: number | string;
  note?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background-elevated px-4 py-3">
      <div className="text-xs text-text-soft">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${highlight ? 'text-accent' : ''}`}>
        {value}
      </div>
      {note && <div className="text-[11px] text-text-soft mt-1">{note}</div>}
    </div>
  );
}

function ActivityWindowToggle({
  value,
  onChange,
}: {
  value: ActivityWindow;
  onChange: (value: ActivityWindow) => void;
}) {
  const { t } = useI18n();
  const options: { value: ActivityWindow; label: string }[] = [
    { value: 'rolling', label: t('adminStats.activityWindowRolling') },
    { value: 'calendar', label: t('adminStats.activityWindowCalendar') },
  ];

  return (
    <div
      className="inline-flex rounded-lg border border-border-subtle bg-background-elevated p-1 text-xs"
      role="group"
      aria-label={t('adminStats.activityWindowAria')}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={`rounded-md px-3 py-1.5 transition-colors ${
              selected ? 'bg-accent text-white' : 'text-text-soft hover:text-text'
            }`}
            aria-pressed={selected}
            onClick={() => {
              if (!selected) onChange(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function TrendBars({
  title,
  bars,
  partialLabel,
  emptyLabel,
}: {
  title: string;
  bars: { weekStart: string; value: number; sublabel?: string; partial?: boolean }[];
  partialLabel: string;
  emptyLabel: string;
}) {
  const max = Math.max(...bars.map((bar) => bar.value), 0);

  return (
    <div className="rounded-lg border border-border-subtle bg-background-elevated p-4">
      <h3 className="text-sm font-medium text-text-soft mb-3">{title}</h3>
      {max === 0 ? (
        <p className="text-sm text-text-soft">{emptyLabel}</p>
      ) : (
        <div className="flex items-end gap-1.5 h-28" role="img" aria-label={title}>
          {bars.map((bar) => {
            const heightPct = max > 0 ? Math.round((bar.value / max) * 100) : 0;
            const label = `${bar.weekStart}: ${bar.value}${bar.partial ? ` (${partialLabel})` : ''}`;
            return (
              <div
                key={bar.weekStart}
                className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 h-full"
                title={label}
                aria-label={label}
              >
                {bar.value > 0 && (
                  <span className="text-[10px] text-text-soft tabular-nums">{bar.value}</span>
                )}
                <div
                  className={`w-full rounded-t bg-accent ${bar.partial ? 'opacity-40' : ''}`}
                  style={{ height: `${Math.max(heightPct, bar.value > 0 ? 4 : 1)}%` }}
                />
                <span className="text-[9px] text-text-soft truncate w-full text-center">
                  {bar.weekStart.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
