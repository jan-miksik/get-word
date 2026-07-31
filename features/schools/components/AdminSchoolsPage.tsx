'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { useSettingsLanguage } from '@/features/shared/languages/useSettingsLanguage';
import type { SchoolSummary } from '@/features/schools/types';
import { apiFetch } from '@/features/shared/http/api-runtime';

type LoadState =
  | { status: 'loading' }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | { status: 'ready'; schools: SchoolSummary[] };

/** Editor-only picker that links to each school's usage dashboard. */
export function AdminSchoolsPage() {
  const settingsLanguage = useSettingsLanguage();

  return (
    <I18nProvider language={settingsLanguage}>
      <AdminSchoolsContent />
    </I18nProvider>
  );
}

function AdminSchoolsContent() {
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/admin/schools', { credentials: 'same-origin' })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) return setState({ status: 'unauthorized' });
        if (response.status === 403) return setState({ status: 'forbidden' });
        if (!response.ok) return setState({ status: 'error' });
        const body = (await response.json()) as { schools?: SchoolSummary[] };
        setState({ status: 'ready', schools: body.schools ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          {state.status === 'forbidden' && <p>{t('schoolStats.adminForbidden')}</p>}
          {state.status === 'error' && <p>{t('schoolStats.schoolsError')}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">{t('schoolStats.schoolsTitle')}</h1>
          <Link href="/admin/stats" className="text-sm text-accent underline">
            {t('schoolStats.backToAdminStats')}
          </Link>
        </header>

        {state.schools.length === 0 ? (
          <p className="text-sm text-text-soft">{t('schoolStats.schoolsEmpty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border-subtle">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-soft bg-background-elevated">
                  <th className="px-3 py-2 font-medium">{t('schoolStats.schoolsTableName')}</th>
                  <th className="px-3 py-2 font-medium">{t('schoolStats.status')}</th>
                  <th className="px-3 py-2 font-medium text-right">
                    {t('schoolStats.seatsStudents')}
                  </th>
                  <th className="px-3 py-2 font-medium text-right">
                    {t('schoolStats.seatsTeachers')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.schools.map((school) => (
                  <tr key={school.id} className="border-t border-border-subtle">
                    <td className="px-3 py-2">
                      <Link href={`/admin/schools/${school.id}`} className="text-accent underline">
                        {school.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-text-soft">
                      {t(
                        school.status === 'active'
                          ? 'schoolStats.statusActive'
                          : 'schoolStats.statusInactive',
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{school.activeStudents}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{school.activeTeachers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
