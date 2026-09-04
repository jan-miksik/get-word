'use client';

import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { SegmentedToggle } from '@/components/stats/StatsPrimitives';
import type { TesterScope, UsageStats } from '@/features/admin/types';

/**
 * Title row plus the one control that reframes every panel below it: which
 * population the dashboard is about. The note reads from the payload rather
 * than the toggle so it describes the numbers actually on screen.
 */
export function AdminStatsHeader({
  testers,
  generatedAt,
  testerScope,
  onTesterScopeChange,
  onReload,
}: {
  testers: UsageStats['testers'];
  generatedAt: string;
  testerScope: TesterScope;
  onTesterScopeChange: (scope: TesterScope) => void;
  onReload: () => void;
}) {
  const { t } = useI18n();
  const noteKey =
    testers.scope === 'only'
      ? 'adminStats.testerScopeNoteOnly'
      : testers.scope === 'all'
        ? 'adminStats.testerScopeNoteAll'
        : 'adminStats.testerScopeNoteHide';

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
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
            {t('adminStats.generatedAt', { time: new Date(generatedAt).toLocaleString() })}
          </span>
          <button type="button" className="text-accent underline" onClick={onReload}>
            {t('adminStats.refresh')}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedToggle<TesterScope>
          value={testerScope}
          onChange={onTesterScopeChange}
          ariaLabel={t('adminStats.testerScopeAria')}
          options={[
            { value: 'hide', label: t('adminStats.testerScopeHide') },
            { value: 'only', label: t('adminStats.testerScopeOnly') },
            { value: 'all', label: t('adminStats.testerScopeAll') },
          ]}
        />
        <span className="text-xs text-text-soft">
          {t(noteKey, { count: testers.knownAccounts })}
        </span>
      </div>
    </header>
  );
}
