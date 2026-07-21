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
import { useSettingsLanguage } from '@/features/shared/languages/useSettingsLanguage';
import { useSchoolStats } from '@/features/schools/client/useSchoolStats';
import type { SchoolMemberUsageRow } from '@/features/schools/types';
import type { I18nKey } from '@/lib/i18n/locales/en';

type SchoolStatsPageProps = {
  endpoint: string;
  /** Where the page leads back to, so no state of it is a dead end. */
  backHref: string;
  backLabelKey: I18nKey;
};

/**
 * One school's usage dashboard, shared by the teacher-facing `/school/overview`
 * and the editor-facing `/admin/schools/[id]`. Member rows are pseudonymized —
 * see `lib/db/queries/school-usage-stats.ts`.
 */
export function SchoolStatsPage(props: SchoolStatsPageProps) {
  const settingsLanguage = useSettingsLanguage();

  return (
    <I18nProvider language={settingsLanguage}>
      <SchoolStatsContent {...props} />
    </I18nProvider>
  );
}

function BackLink({ href, labelKey }: { href: string; labelKey: I18nKey }) {
  const { t } = useI18n();
  return (
    <Link href={href} className="text-sm text-accent underline">
      ← {t(labelKey)}
    </Link>
  );
}

function SchoolStatsContent({ endpoint, backHref, backLabelKey }: SchoolStatsPageProps) {
  const { t } = useI18n();
  const { state, activityWindow, reload, changeActivityWindow } = useSchoolStats(endpoint);

  if (state.status !== 'ready') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-text">
        <div className="text-center text-text-soft space-y-3 px-4">
          {state.status === 'loading' && <p>{t('app.loading')}</p>}
          {state.status === 'unauthorized' && (
            <>
              <p>{t('schoolStats.signInRequired')}</p>
              <Link href="/login" className="inline-block text-accent underline">
                {t('schoolStats.signInLink')}
              </Link>
            </>
          )}
          {state.status === 'forbidden' && <p>{t('schoolStats.forbidden')}</p>}
          {state.status === 'notFound' && <p>{t('schoolStats.notFound')}</p>}
          {state.status === 'error' && (
            <>
              <p>{t('schoolStats.error')}</p>
              <button type="button" className="inline-block text-accent underline" onClick={reload}>
                {t('schoolStats.retry')}
              </button>
            </>
          )}
          {state.status !== 'loading' && (
            <p>
              <BackLink href={backHref} labelKey={backLabelKey} />
            </p>
          )}
        </div>
      </div>
    );
  }

  const { stats } = state;
  const isCalendarActivity = stats.activity.window === 'calendar';
  const resetAt = new Date(stats.ai.resetAt).toLocaleDateString();

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <BackLink href={backHref} labelKey={backLabelKey} />
            <h1 className="mt-1 text-2xl font-semibold">{stats.school.name}</h1>
            <p className="text-sm text-text-soft">{t('schoolStats.title')}</p>
          </div>
          <div className="flex items-baseline gap-3 text-sm text-text-soft">
            <span>
              {t('schoolStats.generatedAt', {
                time: new Date(stats.generatedAt).toLocaleString(),
              })}
            </span>
            <button type="button" className="text-accent underline" onClick={reload}>
              {t('schoolStats.refresh')}
            </button>
          </div>
        </header>

        <Section
          title={t('schoolStats.sectionSchool')}
          note={
            stats.school.pilotExpiresAt
              ? t('schoolStats.pilotExpires', {
                  date: new Date(stats.school.pilotExpiresAt).toLocaleDateString(),
                })
              : t('schoolStats.pilotNoExpiry')
          }
        >
          <CardGrid>
            <StatCard
              label={t('schoolStats.seatsStudents')}
              value={`${stats.seats.activeStudents} / ${stats.seats.studentLimit}`}
              highlight
            />
            <StatCard
              label={t('schoolStats.seatsTeachers')}
              value={`${stats.seats.activeTeachers} / ${stats.seats.teacherLimit}`}
            />
            <StatCard
              label={t('schoolStats.status')}
              value={t(
                stats.school.status === 'active'
                  ? 'schoolStats.statusActive'
                  : 'schoolStats.statusInactive',
              )}
            />
          </CardGrid>
          <TrendBars
            title={t('schoolStats.joinedWeekly')}
            partialLabel={t('schoolStats.partialWeek')}
            emptyLabel={t('schoolStats.noData')}
            bars={stats.membership.joinedWeekly.map((week) => ({
              weekStart: week.weekStart,
              value: week.count,
              partial: week.partial,
            }))}
          />
        </Section>

        <Section
          title={t('schoolStats.sectionActivity')}
          note={t(
            isCalendarActivity
              ? 'schoolStats.activityNoteCalendar'
              : 'schoolStats.activityNoteRolling',
          )}
          actions={
            <ActivityWindowToggle
              value={activityWindow}
              onChange={changeActivityWindow}
              rollingLabel={t('schoolStats.activityWindowRolling')}
              calendarLabel={t('schoolStats.activityWindowCalendar')}
              ariaLabel={t('schoolStats.activityWindowAria')}
            />
          }
        >
          <CardGrid>
            <StatCard
              label={t(isCalendarActivity ? 'schoolStats.dauCalendar' : 'schoolStats.dau')}
              value={stats.activity.dau}
            />
            <StatCard
              label={t(isCalendarActivity ? 'schoolStats.wauCalendar' : 'schoolStats.wau')}
              value={stats.activity.wau}
            />
            <StatCard
              label={t(isCalendarActivity ? 'schoolStats.mauCalendar' : 'schoolStats.mau')}
              value={stats.activity.mau}
              highlight
            />
          </CardGrid>
        </Section>

        <Section title={t('schoolStats.sectionStudy')}>
          <CardGrid>
            <StatCard label={t('schoolStats.known')} value={stats.study.known30d} />
            <StatCard label={t('schoolStats.reallyKnown')} value={stats.study.reallyKnown30d} />
            <StatCard label={t('schoolStats.unknown')} value={stats.study.unknown30d} />
          </CardGrid>
          <p className="text-sm text-text-soft">
            {t('schoolStats.studySummary', {
              studied: stats.study.studyingMembers30d,
              members: stats.seats.activeStudents + stats.seats.activeTeachers,
            })}
          </p>
          <TrendBars
            title={t('schoolStats.studyWeekly')}
            partialLabel={t('schoolStats.partialWeek')}
            emptyLabel={t('schoolStats.noData')}
            bars={stats.study.weekly.map((week) => ({
              weekStart: week.weekStart,
              value: week.reviews,
              partial: week.partial,
            }))}
          />
        </Section>

        <Section
          title={t('schoolStats.sectionAi')}
          note={t('schoolStats.aiNote', {
            date: resetAt,
            studentTranslation: stats.ai.limits.student.translationItemsMonthly,
            studentPhotoLab: stats.ai.limits.student.photoLabMonthly,
            teacherTranslation: stats.ai.limits.teacher.translationItemsMonthly,
            teacherPhotoLab: stats.ai.limits.teacher.photoLabMonthly,
          })}
        >
          <CardGrid>
            <StatCard
              label={t('schoolStats.translationItems')}
              value={stats.ai.translation.itemsUsed}
              highlight
              note={t('schoolStats.membersAtLimit', {
                count: stats.ai.translation.membersAtLimit,
              })}
            />
            <StatCard
              label={t('schoolStats.translationRequests')}
              value={stats.ai.translation.requests}
              note={t('schoolStats.requestSplit', {
                completed: stats.ai.translation.completed,
                failed: stats.ai.translation.failed,
              })}
            />
            <StatCard
              label={t('schoolStats.translationCharacters')}
              value={stats.ai.translation.charactersCharged}
              note={
                stats.ai.translation.charactersReserved > 0
                  ? t('schoolStats.charactersReserved', {
                      count: stats.ai.translation.charactersReserved,
                    })
                  : undefined
              }
            />
            <StatCard
              label={t('schoolStats.photoLab')}
              value={stats.ai.photoLab.used}
              note={t('schoolStats.membersAtLimit', { count: stats.ai.photoLab.membersAtLimit })}
            />
          </CardGrid>
        </Section>

        <Section title={t('schoolStats.sectionContent')} note={t('schoolStats.contentNote')}>
          <CardGrid>
            <StatCard
              label={t('schoolStats.teacherLists')}
              value={stats.content.teacherListsCreated}
              note={t('schoolStats.publicTeacherLists', {
                count: stats.content.publicTeacherLists,
              })}
            />
            <StatCard
              label={t('schoolStats.memberSubscriptions')}
              value={stats.content.memberSubscriptions}
            />
          </CardGrid>
          {stats.content.topPublicTeacherLists.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-text-soft mb-2">
                {t('schoolStats.topLists')}
              </h3>
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-soft bg-background-elevated">
                      <th className="px-3 py-2 font-medium">{t('schoolStats.tableList')}</th>
                      <th className="px-3 py-2 font-medium">{t('schoolStats.tableLanguages')}</th>
                      <th className="px-3 py-2 font-medium text-right">
                        {t('schoolStats.tableSubscribers')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.content.topPublicTeacherLists.map((list) => (
                      <tr key={list.id} className="border-t border-border-subtle">
                        <td className="px-3 py-2">{list.name}</td>
                        <td className="px-3 py-2 text-text-soft whitespace-nowrap">
                          {list.languageFrom} → {list.languageTo}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {list.schoolSubscriberCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>

        <Section title={t('schoolStats.sectionMembers')} note={t('schoolStats.membersNote')}>
          {stats.members.length === 0 ? (
            <p className="text-sm text-text-soft">{t('schoolStats.noMembers')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border-subtle">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-soft bg-background-elevated">
                    <th className="px-3 py-2 font-medium">{t('schoolStats.tableMember')}</th>
                    <th className="px-3 py-2 font-medium">{t('schoolStats.tableJoined')}</th>
                    <th className="px-3 py-2 font-medium">{t('schoolStats.tableLastActive')}</th>
                    <th className="px-3 py-2 font-medium text-right">
                      {t('schoolStats.tableReviews')}
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      {t('schoolStats.tableTranslations')}
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      {t('schoolStats.tablePhotoLab')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.members.map((member) => (
                    <MemberRow key={`${member.role}-${member.ordinal}`} member={member} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function MemberRow({ member }: { member: SchoolMemberUsageRow }) {
  const { t } = useI18n();
  const label = t(
    member.role === 'teacher' ? 'schoolStats.memberTeacher' : 'schoolStats.memberStudent',
    { n: member.ordinal },
  );

  return (
    <tr className="border-t border-border-subtle">
      <td className="px-3 py-2 whitespace-nowrap">{label}</td>
      <td className="px-3 py-2 text-text-soft whitespace-nowrap">{member.joinedOn}</td>
      <td className="px-3 py-2 text-text-soft whitespace-nowrap">
        {member.lastActiveOn ?? t('schoolStats.neverActive')}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{member.reviews30d}</td>
      <td className="px-3 py-2 text-right tabular-nums">{member.translationItemsUsed}</td>
      <td className="px-3 py-2 text-right tabular-nums">{member.photoLabUsed}</td>
    </tr>
  );
}
