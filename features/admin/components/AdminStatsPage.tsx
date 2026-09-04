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
import { AdminSurveysSection } from '@/features/admin/components/AdminSurveysSection';
import { useAdminStats } from '@/features/admin/client/useAdminStats';
import type {
  AdminUserRow,
  DeviceFormFactor,
  DevicePlatform,
  GoalAdherenceBucket,
} from '@/features/admin/types';
import { useSettingsLanguage } from '@/features/shared/languages/useSettingsLanguage';
import { getLanguageFlag, getLocalizedLanguageName } from '@/lib/i18n/languages';
import { pluralForm } from '@/lib/i18n/plural';

type SortDirection = 'asc' | 'desc';
type UserSortKey =
  | 'lastSeenAt'
  | 'firstSeenAt'
  | 'reviewCount'
  | 'activeDays'
  | 'studySessions'
  | 'estActiveStudySeconds'
  | 'activeSeconds30d'
  | 'sessions30d'
  | 'medianSessionSeconds'
  | 'photoAnalyses'
  | 'gameScore'
  | 'deviceCount'
  | 'goalMetDays30d'
  | 'goalAdherence30d';
type ListSortKey = 'name' | 'subscriberCount' | 'activeSubscriberCount';

/**
 * Columns of the "who to write to" table, beside the always-present handle.
 *
 * The reader picks which of these show; the choice is per-browser and survives
 * a reload. Everything is on by default — hiding a column somebody relies on
 * without being asked would be worse than a wide table.
 */
interface UserColumn {
  key: string;
  label: string;
  hint?: string;
  sortKey?: UserSortKey;
  align?: 'right';
  render: (user: AdminUserRow) => React.ReactNode;
}

const USER_COLUMNS_STORAGE_KEY = 'get-word-admin-stats-hidden-columns';

/** "word/day" inflects in Czech and Ukrainian; "min/day" does not. */
const GOAL_WORDS_PER_DAY_LABEL = {
  one: 'adminStats.goalWordsPerDayOne',
  few: 'adminStats.goalWordsPerDayFew',
  many: 'adminStats.goalWordsPerDayMany',
} as const;

function readHiddenColumns(): string[] {
  // The dashboard renders "loading" until a client fetch resolves, so no
  // server-rendered markup depends on this. It still has to survive being
  // called with no `window` at all.
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(USER_COLUMNS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

/** Label/count list, the shape the device breakdowns already use. */
function BreakdownPanel({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: { key: string; label: string; value: string | number }[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background-elevated p-4">
      <h3 className="text-sm font-medium text-text-soft mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-text-soft">{emptyLabel}</p>
      ) : (
        <div className="space-y-1 text-sm">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3">
              <span>{row.label}</span>
              <span className="tabular-nums text-text-soft">{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rows a long breakdown table shows before the reader asks for the rest. */
const GOOGLE_API_VISIBLE_ROWS = 5;
const LANGUAGE_VISIBLE_ROWS = 10;

function ShowMoreToggle({
  expanded,
  hiddenCount,
  onToggle,
  showAllLabel,
  showLessLabel,
}: {
  expanded: boolean;
  hiddenCount: number;
  onToggle: () => void;
  showAllLabel: string;
  showLessLabel: string;
}) {
  if (hiddenCount <= 0) return null;
  return (
    <button type="button" className="mt-2 text-xs text-accent underline" onClick={onToggle}>
      {expanded ? showLessLabel : showAllLabel}
    </button>
  );
}

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
  const { t, language } = useI18n();
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
  const [userLanguageFilter, setUserLanguageFilter] = useState<string>('all');
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(readHiddenColumns);
  const [showAllGoogleApi, setShowAllGoogleApi] = useState(false);
  const [showAllLanguageTargets, setShowAllLanguageTargets] = useState(false);
  const [showAllLanguagePairs, setShowAllLanguagePairs] = useState(false);

  const persistHiddenColumns = (next: string[]) => {
    setHiddenColumns(next);
    try {
      window.localStorage.setItem(USER_COLUMNS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // A browser refusing storage still gets the choice for this session.
    }
  };

  const toggleColumn = (key: string) =>
    persistHiddenColumns(
      hiddenColumns.includes(key)
        ? hiddenColumns.filter((entry) => entry !== key)
        : [...hiddenColumns, key]
    );

  const resetColumns = () => persistHiddenColumns([]);

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

  const googleUsageSourceLabel = (source: string) => {
    switch (source) {
      case 'audio_batch':
        return t('adminStats.googleApiSourceAudioBatch');
      case 'audio_repair':
        return t('adminStats.googleApiSourceAudioRepair');
      case 'common_list_autogenerate':
        return t('adminStats.googleApiSourceCommonList');
      case 'landing_demo_audio_script':
        return t('adminStats.googleApiSourceDemoAudio');
      case 'landing_demo_words_script':
        return t('adminStats.googleApiSourceDemoWords');
      case 'list_fork':
        return t('adminStats.googleApiSourceListFork');
      case 'photo_lab_audio':
        return t('adminStats.googleApiSourcePhotoLab');
      case 'supported_languages':
        return t('adminStats.googleApiSourceLanguages');
      case 'translation_batch':
        return t('adminStats.googleApiSourceListTranslation');
      case 'tts_voice_catalog':
        return t('adminStats.googleApiSourceVoiceCatalog');
      case 'ui_locale_runtime':
        return t('adminStats.googleApiSourceUiRuntime');
      case 'ui_locale_script':
        return t('adminStats.googleApiSourceUiScript');
      case 'word_chat_audio':
        return t('adminStats.googleApiSourceWordChat');
      default:
        return source;
    }
  };

  const goalWordsLabel = (count: number) =>
    t(pluralForm(GOAL_WORDS_PER_DAY_LABEL, language, count), { count });

  const adherenceBucketLabel = (bucket: GoalAdherenceBucket) => {
    switch (bucket) {
      case 'full':
        return t('adminStats.goalsBucketFull');
      case 'high':
        return t('adminStats.goalsBucketHigh');
      case 'mid':
        return t('adminStats.goalsBucketMid');
      case 'low':
        return t('adminStats.goalsBucketLow');
      case 'none':
        return t('adminStats.goalsBucketNone');
    }
  };

  const goalPresetLabel = (preset: string) => {
    switch (preset) {
      case 'light':
        return t('adminStats.goalsPresetLight');
      case 'medium':
        return t('adminStats.goalsPresetMedium');
      case 'intense':
        return t('adminStats.goalsPresetIntense');
      case 'custom':
        return t('adminStats.goalsPresetCustom');
      default:
        return preset;
    }
  };

  /** Distribution keys are `minutes:10` / `words:5`, mode included on purpose. */
  const dailyTargetLabel = (key: string) => {
    const [mode, value] = key.split(':');
    return mode === 'words'
      ? goalWordsLabel(Number(value))
      : t('adminStats.goalMinutesPerDay', { count: Number(value) });
  };

  const languageLabel = (code: string) =>
    getLocalizedLanguageName(code, language) ?? code;
  const languageWithFlag = (code: string) =>
    `${getLanguageFlag(code) ?? '🌐'} ${languageLabel(code)}`;

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
      case 'activeSeconds30d':
        return user.activeSeconds30d;
      case 'sessions30d':
        return user.sessions30d;
      case 'medianSessionSeconds':
        return user.medianSessionSeconds;
      case 'photoAnalyses':
        return user.photoAnalyses;
      case 'gameScore':
        return user.gameScore;
      case 'deviceCount':
        return user.deviceCount;
      case 'goalMetDays30d':
        return user.goalProgress30d.metDays;
      case 'goalAdherence30d':
        // Accounts with nothing to measure sort below 0 %, not above it.
        return user.goalProgress30d.expectedDays > 0
          ? user.goalProgress30d.metDays / user.goalProgress30d.expectedDays
          : -1;
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
      // Filters on the studied language, not the selected one: the question is
      // who is learning a language, not who has it configured.
      const matchesLanguage =
        userLanguageFilter === 'all' ||
        user.studiedLanguages.some((entry) => entry.language === userLanguageFilter);
      return matchesSearch && matchesPlatform && matchesFormFactor && matchesLanguage;
    })
    .sort((a, b) => {
      const result = valueForUserSort(a) - valueForUserSort(b);
      return userSort.direction === 'asc' ? result : -result;
    });

  const formatGoal = (goal: AdminUserRow['goal']) => {
    if (!goal) return t('adminStats.userGoalNone');
    const size =
      goal.mode === 'words'
        ? goalWordsLabel(goal.newWordsPerDay ?? 0)
        : t('adminStats.goalMinutesPerDay', { count: goal.minutesPerDay ?? 0 });
    const label = t('adminStats.goalSummary', { size, days: goal.daysPerWeek });
    return goal.enabled ? label : t('adminStats.goalDisabledSummary', { goal: label });
  };
  const adherenceOf = (user: AdminUserRow) =>
    user.goalProgress30d.expectedDays > 0
      ? user.goalProgress30d.metDays / user.goalProgress30d.expectedDays
      : null;
  const formatPercent = (share: number) => `${Math.round(share * 100)}%`;

  const userColumns: UserColumn[] = [
    {
      key: 'lastSeenAt',
      label: t('adminStats.userLastSeen'),
      sortKey: 'lastSeenAt',
      render: (user) => <span className="text-text-soft">{formatDate(user.lastSeenAt)}</span>,
    },
    {
      key: 'firstSeenAt',
      label: t('adminStats.userFirstSeen'),
      sortKey: 'firstSeenAt',
      render: (user) => <span className="text-text-soft">{formatDate(user.firstSeenAt)}</span>,
    },
    {
      key: 'device',
      label: t('adminStats.userDevice'),
      render: (user) => (
        <span className="text-text-soft">
          {platformLabel(user.lastDevicePlatform)} / {formFactorLabel(user.lastDeviceFormFactor)}
        </span>
      ),
    },
    {
      key: 'languages',
      label: t('adminStats.userLanguages'),
      hint: t('adminStats.userLanguagesHint'),
      render: (user) =>
        user.studiedLanguages.length > 0 ? (
          <span
            title={user.studiedLanguages
              .map((entry) =>
                t('adminStats.userLanguageEntry', {
                  language: languageLabel(entry.language),
                  reviews: entry.reviews,
                })
              )
              .join('\n')}
          >
            {user.studiedLanguages.map((entry) => (
              <span key={entry.language} className="mr-2">
                {getLanguageFlag(entry.language) ?? '🌐'}
                <span className="ml-0.5 font-mono text-[10px]">{entry.language}</span>
              </span>
            ))}
          </span>
        ) : user.selectedLanguageTo ? (
          <span className="text-text-soft" title={t('adminStats.userLanguagesSelectedOnly')}>
            ({getLanguageFlag(user.selectedLanguageTo) ?? '🌐'}
            <span className="ml-0.5 font-mono text-[10px]">{user.selectedLanguageTo}</span>)
          </span>
        ) : (
          <span className="text-text-soft">—</span>
        ),
    },
    {
      key: 'goal',
      label: t('adminStats.userGoal'),
      hint: t('adminStats.userGoalHint'),
      render: (user) => (
        <span className={user.goal?.enabled ? undefined : 'text-text-soft'}>
          {formatGoal(user.goal)}
        </span>
      ),
    },
    {
      key: 'goalMetDays30d',
      label: t('adminStats.userGoalMetDays'),
      hint: t('adminStats.userGoalMetDaysHint'),
      sortKey: 'goalMetDays30d',
      align: 'right',
      render: (user) =>
        user.goalProgress30d.expectedDays > 0
          ? t('adminStats.userGoalMetOfExpected', {
              met: user.goalProgress30d.metDays,
              expected: Math.round(user.goalProgress30d.expectedDays),
            })
          : '—',
    },
    {
      key: 'goalAdherence30d',
      label: t('adminStats.userGoalAdherence'),
      hint: t('adminStats.userGoalAdherenceHint'),
      sortKey: 'goalAdherence30d',
      align: 'right',
      render: (user) => {
        const share = adherenceOf(user);
        return share === null ? '—' : formatPercent(share);
      },
    },
    {
      key: 'deviceCount',
      label: t('adminStats.userDeviceCount'),
      hint: t('adminStats.userDeviceCountHint'),
      sortKey: 'deviceCount',
      align: 'right',
      render: (user) => user.deviceCount,
    },
    {
      key: 'gameScore',
      label: t('adminStats.userGameScore'),
      hint: t('adminStats.userGameScoreHint'),
      sortKey: 'gameScore',
      align: 'right',
      render: (user) => user.gameScore,
    },
    {
      key: 'reviewCount',
      label: t('adminStats.userReviews'),
      hint: t('adminStats.userReviewsHint'),
      sortKey: 'reviewCount',
      align: 'right',
      render: (user) => user.reviewCount,
    },
    {
      key: 'activeDays',
      label: t('adminStats.userActiveDays'),
      hint: t('adminStats.userActiveDaysHint'),
      sortKey: 'activeDays',
      align: 'right',
      render: (user) => user.activeDays,
    },
    {
      key: 'studySessions',
      label: t('adminStats.userSessions'),
      hint: t('adminStats.userSessionsHint'),
      sortKey: 'studySessions',
      align: 'right',
      render: (user) => user.studySessions,
    },
    {
      key: 'estActiveStudySeconds',
      label: t('adminStats.userStudyTime'),
      hint: t('adminStats.userStudyTimeHint'),
      sortKey: 'estActiveStudySeconds',
      align: 'right',
      render: (user) => formatStudyTime(user.estActiveStudySeconds),
    },
    {
      key: 'activeSeconds30d',
      label: t('adminStats.userActiveTime'),
      hint: t('adminStats.userActiveTimeHint'),
      sortKey: 'activeSeconds30d',
      align: 'right',
      render: (user) => formatStudyTime(user.activeSeconds30d),
    },
    {
      key: 'sessions30d',
      label: t('adminStats.userActiveSessions'),
      hint: t('adminStats.userActiveSessionsHint'),
      sortKey: 'sessions30d',
      align: 'right',
      render: (user) => user.sessions30d || '—',
    },
    {
      key: 'medianSessionSeconds',
      label: t('adminStats.userMedianSession'),
      hint: t('adminStats.userMedianSessionHint'),
      sortKey: 'medianSessionSeconds',
      align: 'right',
      render: (user) => formatStudyTime(user.medianSessionSeconds),
    },
    {
      key: 'photoAnalyses',
      label: t('adminStats.userPhotos'),
      sortKey: 'photoAnalyses',
      align: 'right',
      render: (user) => user.photoAnalyses,
    },
    {
      key: 'email',
      label: t('adminStats.userEmail'),
      render: (user) =>
        revealedEmails.has(user.handle) ? (
          <span className="select-all">{user.email}</span>
        ) : (
          <button
            type="button"
            className="text-accent underline"
            onClick={() => revealEmail(user.handle)}
          >
            {t('adminStats.revealEmail')}
          </button>
        ),
    },
  ];
  const visibleColumns = userColumns.filter((column) => !hiddenColumns.includes(column.key));

  const visibleLanguageTargets = showAllLanguageTargets
    ? stats.languages.targets
    : stats.languages.targets.slice(0, LANGUAGE_VISIBLE_ROWS);
  const visibleLanguagePairs = showAllLanguagePairs
    ? stats.languages.pairs
    : stats.languages.pairs.slice(0, LANGUAGE_VISIBLE_ROWS);
  const visibleGoogleApiSources = showAllGoogleApi
    ? stats.googleApi.sources
    : stats.googleApi.sources.slice(0, GOOGLE_API_VISIBLE_ROWS);
  const languageFilterOptions = stats.languages.targets
    .filter((target) => target.learners > 0)
    .map((target) => target.language);

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
            <Link href="/admin/quality" className="text-accent underline">
              {t('adminQuality.navLink')}
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
            <StatCard label={t('adminStats.providerApple')} value={stats.registrations.apple} />
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
          title={t('adminStats.sectionLanguages')}
          note={t('adminStats.languagesNote')}
        >
          <CardGrid>
            <StatCard
              label={t('adminStats.languagesLearners')}
              value={stats.languages.learners}
              highlight
              note={t('adminStats.languagesLearners30d', { count: stats.languages.learners30d })}
            />
            <StatCard
              label={t('adminStats.languagesMulti')}
              value={stats.languages.multiLanguageLearners}
              note={
                stats.languages.learners > 0
                  ? t('adminStats.languagesMultiShare', {
                      percent: Math.round(
                        (stats.languages.multiLanguageLearners / stats.languages.learners) * 100
                      ),
                    })
                  : undefined
              }
            />
            <StatCard
              label={t('adminStats.languagesMulti30d')}
              value={stats.languages.multiLanguageLearners30d}
            />
            <StatCard
              label={t('adminStats.languagesDistinctTargets')}
              value={stats.languages.targets.filter((target) => target.learners > 0).length}
              note={t('adminStats.languagesDistinctPairs', { count: stats.languages.pairs.length })}
            />
          </CardGrid>

          {stats.languages.targets.length === 0 ? (
            <p className="text-sm text-text-soft">{t('adminStats.noData')}</p>
          ) : (
            <>
              <div>
                <h3 className="text-sm font-medium text-text-soft mb-2">
                  {t('adminStats.languagesTargets')}
                </h3>
                <div className="overflow-x-auto rounded-lg border border-border-subtle">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-soft bg-background-elevated">
                        <th className="px-3 py-2 font-medium">
                          {t('adminStats.languagesLanguage')}
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          {t('adminStats.languagesLearnersColumn')}
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          {t('adminStats.languagesLearners30dColumn')}
                        </th>
                        <th
                          className="px-3 py-2 font-medium text-right"
                          title={t('adminStats.languagesSelectedHint')}
                        >
                          {t('adminStats.languagesSelected')}
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          {t('adminStats.languagesReviews')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLanguageTargets.map((target) => (
                        <tr key={target.language} className="border-t border-border-subtle">
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="mr-1">{getLanguageFlag(target.language) ?? '🌐'}</span>
                            {languageLabel(target.language)}
                            <span className="ml-1 font-mono text-[10px] text-text-soft">
                              {target.language}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{target.learners}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{target.learners30d}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-text-soft">
                            {target.selectedBy}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{target.reviews}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ShowMoreToggle
                  expanded={showAllLanguageTargets}
                  hiddenCount={stats.languages.targets.length - LANGUAGE_VISIBLE_ROWS}
                  onToggle={() => setShowAllLanguageTargets((previous) => !previous)}
                  showAllLabel={t('adminStats.languagesShowAll', {
                    count: stats.languages.targets.length,
                  })}
                  showLessLabel={t('adminStats.languagesShowTop', { count: LANGUAGE_VISIBLE_ROWS })}
                />
              </div>

              {stats.languages.pairs.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-text-soft mb-2">
                    {t('adminStats.languagesPairs')}
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-border-subtle">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-text-soft bg-background-elevated">
                          <th className="px-3 py-2 font-medium">
                            {t('adminStats.languagesDirection')}
                          </th>
                          <th className="px-3 py-2 font-medium text-right">
                            {t('adminStats.languagesLearnersColumn')}
                          </th>
                          <th className="px-3 py-2 font-medium text-right">
                            {t('adminStats.languagesLearners30dColumn')}
                          </th>
                          <th
                            className="px-3 py-2 font-medium text-right"
                            title={t('adminStats.languagesSelectedHint')}
                          >
                            {t('adminStats.languagesSelected')}
                          </th>
                          <th className="px-3 py-2 font-medium text-right">
                            {t('adminStats.languagesReviews')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLanguagePairs.map((pair) => (
                          <tr
                            key={`${pair.languageFrom}>${pair.languageTo}`}
                            className="border-t border-border-subtle"
                          >
                            <td className="px-3 py-2 whitespace-nowrap">
                              {languageWithFlag(pair.languageFrom)} →{' '}
                              {languageWithFlag(pair.languageTo)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{pair.learners}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{pair.learners30d}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-text-soft">
                              {pair.selectedBy}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{pair.reviews}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ShowMoreToggle
                    expanded={showAllLanguagePairs}
                    hiddenCount={stats.languages.pairs.length - LANGUAGE_VISIBLE_ROWS}
                    onToggle={() => setShowAllLanguagePairs((previous) => !previous)}
                    showAllLabel={t('adminStats.languagesShowAll', {
                      count: stats.languages.pairs.length,
                    })}
                    showLessLabel={t('adminStats.languagesShowTop', {
                      count: LANGUAGE_VISIBLE_ROWS,
                    })}
                  />
                </div>
              )}
            </>
          )}
        </Section>

        <Section title={t('adminStats.sectionGoals')} note={t('adminStats.goalsNote')}>
          <CardGrid>
            <StatCard
              label={t('adminStats.goalsEnabled')}
              value={stats.goals.enabled}
              highlight
              note={
                stats.goals.disabled > 0
                  ? t('adminStats.goalsDisabledNote', { count: stats.goals.disabled })
                  : undefined
              }
            />
            <StatCard
              label={t('adminStats.goalsAdherence')}
              value={
                stats.goals.expectedDays30d > 0
                  ? formatPercent(stats.goals.metDays30d / stats.goals.expectedDays30d)
                  : '—'
              }
              note={t('adminStats.goalsAdherenceNote', {
                met: stats.goals.metDays30d,
                expected: Math.round(stats.goals.expectedDays30d),
              })}
            />
            <StatCard
              label={t('adminStats.goalsFullyKept')}
              value={stats.goals.adherence.find((row) => row.bucket === 'full')?.learners ?? 0}
              note={t('adminStats.goalsTrackedNote', { count: stats.goals.trackedLearners30d })}
            />
            <StatCard
              label={t('adminStats.goalsModeMinutes')}
              value={stats.goals.minutesMode}
              note={t('adminStats.goalsModeWordsNote', { count: stats.goals.wordsMode })}
            />
            <StatCard
              label={t('adminStats.goalsUntracked')}
              value={stats.goals.untrackedLearners30d}
              note={t('adminStats.goalsUntrackedNote')}
            />
          </CardGrid>
          <div className="grid gap-3 sm:grid-cols-2">
            <BreakdownPanel
              title={t('adminStats.goalsAdherenceBreakdown')}
              emptyLabel={t('adminStats.noData')}
              rows={stats.goals.adherence
                .filter((row) => row.learners > 0)
                .map((row) => ({
                  key: row.bucket,
                  label: adherenceBucketLabel(row.bucket),
                  value: row.learners,
                }))}
            />
            <BreakdownPanel
              title={t('adminStats.goalsDaysPerWeek')}
              emptyLabel={t('adminStats.noData')}
              rows={stats.goals.daysPerWeek.map((bucket) => ({
                key: bucket.key,
                label: t('adminStats.goalsDaysPerWeekValue', { count: Number(bucket.key) }),
                value: bucket.users,
              }))}
            />
            <BreakdownPanel
              title={t('adminStats.goalsDailyTarget')}
              emptyLabel={t('adminStats.noData')}
              rows={stats.goals.dailyTarget.map((bucket) => ({
                key: bucket.key,
                label: dailyTargetLabel(bucket.key),
                value: bucket.users,
              }))}
            />
            <BreakdownPanel
              title={t('adminStats.goalsPresets')}
              emptyLabel={t('adminStats.noData')}
              rows={stats.goals.presets.map((bucket) => ({
                key: bucket.key,
                label: goalPresetLabel(bucket.key),
                value: bucket.users,
              }))}
            />
          </div>
        </Section>

        <Section
          title={t('adminStats.sectionActivityTime')}
          note={t('adminStats.activityTimeNote')}
        >
          {stats.activity30d.usersWithActivity === 0 ? (
            <p className="text-sm text-text-soft">{t('adminStats.activityTimeEmpty')}</p>
          ) : (
            <>
              <CardGrid>
                <StatCard
                  label={t('adminStats.activityPerUser')}
                  value={formatStudyTime(
                    Math.round(stats.activity30d.activeSeconds / stats.activity30d.usersWithActivity),
                  )}
                  highlight
                />
                <StatCard
                  label={t('adminStats.activityMedianSession')}
                  value={formatStudyTime(stats.activity30d.medianSessionSeconds)}
                />
                <StatCard
                  label={t('adminStats.activitySessions')}
                  value={stats.activity30d.sessions}
                  note={t('adminStats.activityUsersNote', {
                    users: stats.activity30d.usersWithActivity,
                  })}
                />
              </CardGrid>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead className="text-text-soft">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">{t('adminStats.activitySurface')}</th>
                      <th className="px-3 py-2 font-medium text-right">
                        {t('adminStats.userActiveTime')}
                      </th>
                      <th className="px-3 py-2 font-medium text-right">
                        {t('adminStats.activityShare')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.activity30d.bySurface.map((row) => (
                      <tr key={row.surface} className="border-t border-border-subtle">
                        <td className="px-3 py-2">{row.surface}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatStudyTime(row.activeSeconds)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {stats.activity30d.activeSeconds === 0
                            ? '—'
                            : `${Math.round((row.activeSeconds / stats.activity30d.activeSeconds) * 100)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
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

        <Section
          title={t('adminStats.sectionGoogleApi')}
          note={t('adminStats.googleApiNote', {
            date: new Date(stats.googleApi.monthStart).toLocaleDateString(),
          })}
        >
          <CardGrid>
            <StatCard
              label={t('adminStats.googleApiTranslate')}
              value={formatTokens(stats.googleApi.translateUnits)}
              highlight
              note={`${Math.round((stats.googleApi.translateUnits / Math.max(1, stats.googleApi.translateFreeUnits)) * 100)}% · ${formatTokens(stats.googleApi.translateFreeUnits)}`}
            />
            <StatCard
              label={t('adminStats.googleApiTts')}
              value={formatTokens(stats.googleApi.ttsUnits)}
              note={`${Math.round((stats.googleApi.ttsUnits / Math.max(1, stats.googleApi.ttsFreeUnits)) * 100)}% · ${formatTokens(stats.googleApi.ttsFreeUnits)}`}
            />
            <StatCard
              label={t('adminStats.googleApiRequests')}
              value={stats.googleApi.requests}
            />
            <StatCard
              label={t('adminStats.googleApiEstimatedTranslateCost')}
              value={formatUsd(stats.googleApi.estimatedTranslationCostUsd)}
            />
          </CardGrid>
          {stats.googleApi.sources.length === 0 ? (
            <p className="text-sm text-text-soft">{t('adminStats.googleApiNoUsage')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border-subtle">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-soft bg-background-elevated">
                    <th className="px-3 py-2 font-medium">{t('adminStats.googleApiScope')}</th>
                    <th className="px-3 py-2 font-medium">{t('adminStats.googleApiSource')}</th>
                    <th className="px-3 py-2 font-medium">{t('adminStats.googleApiModel')}</th>
                    <th className="px-3 py-2 font-medium text-right">{t('adminStats.googleApiUnits')}</th>
                    <th className="px-3 py-2 font-medium text-right">{t('adminStats.googleApiRequests')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGoogleApiSources.map((row) => (
                    <tr
                      key={`${row.scope}:${row.source}:${row.model ?? ''}`}
                      className="border-t border-border-subtle"
                    >
                      <td className="px-3 py-2">{row.scope === 'tts' ? 'TTS' : 'Translate'}</td>
                      <td className="px-3 py-2">
                        <span className="block">{googleUsageSourceLabel(row.source)}</span>
                        <span className="block font-mono text-[10px] text-text-soft">
                          {row.source}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-text-soft">{row.model ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatTokens(row.units)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.requests}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ShowMoreToggle
            expanded={showAllGoogleApi}
            hiddenCount={stats.googleApi.sources.length - GOOGLE_API_VISIBLE_ROWS}
            onToggle={() => setShowAllGoogleApi((previous) => !previous)}
            showAllLabel={t('adminStats.googleApiShowAll', {
              count: stats.googleApi.sources.length,
            })}
            showLessLabel={t('adminStats.googleApiShowTop', { count: GOOGLE_API_VISIBLE_ROWS })}
          />
        </Section>

        <Section
          title={t('adminStats.sectionUiLanguageRequests')}
          note={t('adminStats.uiLanguageRequestsNote')}
        >
          <CardGrid>
            <StatCard
              label={t('adminStats.uiLanguageRequestsTotal')}
              value={stats.uiLanguageRequests.totalRequests}
              highlight
            />
            <StatCard
              label={t('adminStats.uiLanguageRequestsLanguages')}
              value={stats.uiLanguageRequests.languages.length}
            />
          </CardGrid>
          {stats.uiLanguageRequests.languages.length === 0 ? (
            <p className="text-sm text-text-soft">{t('adminStats.uiLanguageRequestsEmpty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border-subtle">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-soft bg-background-elevated">
                    <th className="px-3 py-2 font-medium">{t('adminStats.uiLanguage')}</th>
                    <th className="px-3 py-2 font-medium text-right">
                      {t('adminStats.uiLanguageRequesters')}
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      {t('adminStats.uiLanguageLastRequested')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.uiLanguageRequests.languages.map((row) => (
                    <tr key={row.languageCode} className="border-t border-border-subtle">
                      <td className="px-3 py-2">
                        <span className="mr-2" aria-hidden="true">
                          {getLanguageFlag(row.languageCode) ?? '🌐'}
                        </span>
                        {getLocalizedLanguageName(row.languageCode, language) ?? row.languageCode}
                        <span className="ml-2 font-mono text-[10px] text-text-soft">
                          {row.languageCode}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.requesters}</td>
                      <td className="px-3 py-2 text-right text-text-soft whitespace-nowrap">
                        {formatDate(row.lastRequestedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <AdminSurveysSection
          surveys={stats.surveys}
          revealedEmails={revealedEmails}
          revealEmail={revealEmail}
          formatDate={formatDate}
        />

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
              <div className="grid gap-3 rounded-lg border border-border-subtle bg-background-elevated p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
                <label className="space-y-1">
                  <span className="block text-xs text-text-soft">{t('adminStats.userFilterLanguage')}</span>
                  <select
                    value={userLanguageFilter}
                    onChange={(event) => setUserLanguageFilter(event.target.value)}
                    className="w-full rounded-md border border-border-subtle bg-background px-3 py-2 text-text"
                  >
                    <option value="all">{t('adminStats.filterAll')}</option>
                    {languageFilterOptions.map((code) => (
                      <option key={code} value={code}>
                        {languageLabel(code)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="rounded-lg border border-border-subtle bg-background-elevated p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs text-text-soft">
                    {t('adminStats.userColumnsLabel', {
                      shown: visibleColumns.length,
                      total: userColumns.length,
                    })}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-accent underline"
                    onClick={resetColumns}
                  >
                    {t('adminStats.userColumnsReset')}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                  {userColumns.map((column) => (
                    <label key={column.key} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={hiddenColumns.indexOf(column.key) === -1}
                        onChange={() => toggleColumn(column.key)}
                      />
                      <span>{column.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {visibleUsers.length === 0 ? (
                <p className="text-sm text-text-soft">{t('adminStats.usersFilteredEmpty')}</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border-subtle">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-soft bg-background-elevated">
                        <th className="px-3 py-2 font-medium">{t('adminStats.userHandle')}</th>
                        {visibleColumns.map((column) => (
                          <th
                            key={column.key}
                            className={`px-3 py-2 font-medium${column.align === 'right' ? ' text-right' : ''}`}
                            title={column.hint}
                          >
                            {column.sortKey ? (
                              <SortHeader
                                active={userSort.key === column.sortKey}
                                direction={userSort.direction}
                                onClick={() => toggleUserSort(column.sortKey as UserSortKey)}
                                className={column.align === 'right' ? 'justify-end' : ''}
                                title={column.hint}
                              >
                                {column.label}
                              </SortHeader>
                            ) : (
                              column.label
                            )}
                          </th>
                        ))}
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
                              {visibleColumns.map((column) => (
                                <td
                                  key={column.key}
                                  className={`px-3 py-2 whitespace-nowrap${
                                    column.align === 'right' ? ' text-right tabular-nums' : ''
                                  }`}
                                >
                                  {column.render(user)}
                                </td>
                              ))}
                            </tr>
                            {expanded && (
                              <tr className="bg-background-elevated/50">
                                <td colSpan={visibleColumns.length + 1} className="px-3 py-3">
                                  <ActivityHeatmap
                                    compact
                                    days={user.dailyActivity.map((day) => ({
                                      date: day.date,
                                      // A day in the app with no card answered is
                                      // still an active day, so it gets the
                                      // faintest square rather than none.
                                      value: day.count > 0 ? day.count : 1,
                                    }))}
                                    endDate={new Date(stats.generatedAt)}
                                    emptyLabel={t('adminStats.userHeatmapEmpty')}
                                    lessLabel={t('adminStats.heatmapLess')}
                                    moreLabel={t('adminStats.heatmapMore')}
                                    formatTooltip={(date) => {
                                      const day = user.dailyActivity.find(
                                        (entry) => entry.date === date
                                      );
                                      if (!day) {
                                        return t('adminStats.userHeatmapTooltip', {
                                          date,
                                          count: 0,
                                        });
                                      }
                                      return day.count > 0
                                        ? t('adminStats.userHeatmapTooltip', {
                                            date,
                                            count: day.count,
                                          })
                                        : t('adminStats.userHeatmapTooltipPresence', {
                                            date,
                                            minutes: Math.max(
                                              1,
                                              Math.round(day.activeSeconds / 60)
                                            ),
                                          });
                                    }}
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
