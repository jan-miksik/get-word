'use client';

import { useMemo } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type {
  GoogleUsageAccountScope,
  GoogleUsageGlobalScope,
  GoogleUsageResponse,
  GoogleUsageScope,
} from '@/features/lists/types';

const SCOPE_LABELS: Record<GoogleUsageScope, string> = {
  translate: 'Google Translate',
  tts: 'Google TTS',
};

function getLocale(language: string) {
  return language === 'cs' ? 'cs-CZ' : language;
}

function formatUnits(value: number, language: string) {
  return new Intl.NumberFormat(getLocale(language)).format(Math.max(0, Math.floor(value)));
}

function getUsagePercent(usedUnits: number, limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(0, Math.min(100, (usedUnits / limit) * 100));
}

function UsageBar({
  label,
  percent,
  tone = 'default',
}: {
  label: string;
  percent: number;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const colorClass =
    tone === 'danger'
      ? 'bg-danger'
      : tone === 'warning'
      ? 'bg-amber-400'
      : 'bg-accent';

  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-border-subtle" aria-label={label}>
      <div
        className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function AccountScopeRow({ scope }: { scope: GoogleUsageAccountScope }) {
  const { t, language } = useI18n();
  const percent = getUsagePercent(scope.used_units, scope.account_limit);
  const tone = scope.paused ? 'danger' : percent >= 80 ? 'warning' : 'default';

  return (
    <div className="rounded-lg border border-border-subtle bg-background-elevated/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text">{SCOPE_LABELS[scope.scope]}</p>
          <p className="text-[11px] text-text-soft">
            {t('lists.googleUsageAccountUnits', {
              used: formatUnits(scope.used_units, language),
              limit: formatUnits(scope.account_limit, language),
            })}
          </p>
        </div>
        <div className={`text-xs font-medium ${scope.paused ? 'text-danger' : 'text-text-soft'}`}>
          {scope.paused ? t('lists.paused') : t('lists.percentUsed', { percent: Math.round(percent) })}
        </div>
      </div>
      <UsageBar label={t('lists.googleUsageAccountBar', { scope: SCOPE_LABELS[scope.scope] })} percent={percent} tone={tone} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-soft">
        <span>{t('lists.googleRequestsThisMonth', { count: formatUnits(scope.request_count, language) })}</span>
        <span>{t('lists.googleFreeMonthlyUnits', { count: formatUnits(scope.free_monthly_units, language) })}</span>
      </div>
      {scope.paused && scope.limit_message ? (
        <p className="mt-2 text-xs text-danger">{scope.limit_message}</p>
      ) : null}
    </div>
  );
}

function GlobalScopeRow({ scope }: { scope: GoogleUsageGlobalScope }) {
  const { t, language } = useI18n();
  const percent = getUsagePercent(scope.used_units, scope.free_monthly_units);
  const tone = percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : 'default';

  return (
    <div className="rounded-lg border border-border-subtle bg-background-elevated/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text">{SCOPE_LABELS[scope.scope]}</p>
          <p className="text-[11px] text-text-soft">
            {t('lists.googleUsageGlobalUnits', {
              used: formatUnits(scope.used_units, language),
              limit: formatUnits(scope.free_monthly_units, language),
            })}
          </p>
        </div>
        <div className="text-xs font-medium text-text-soft">{t('lists.percentUsed', { percent: Math.round(percent) })}</div>
      </div>
      <UsageBar label={t('lists.googleUsageGlobalBar', { scope: SCOPE_LABELS[scope.scope] })} percent={percent} tone={tone} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-soft">
        <span>{t('lists.googleActiveAccounts', { count: formatUnits(scope.account_count, language) })}</span>
        <span>{t('lists.googleRequestsThisMonth', { count: formatUnits(scope.request_count, language) })}</span>
      </div>
    </div>
  );
}

type GoogleUsagePanelProps = {
  usage: GoogleUsageResponse;
  compact?: boolean;
};

export function GoogleUsagePanel({ usage, compact = false }: GoogleUsagePanelProps) {
  const { t, language } = useI18n();
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(getLocale(language), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    [language],
  );
  const monthLabel = monthFormatter.format(new Date(usage.period_start));

  const inner = (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-text">{t('lists.googleApiUsage')}</h2>
          <p className="text-xs text-text-soft">{t('lists.googleUsageForMonth', { month: monthLabel })}</p>
        </div>
        <p className="text-[11px] text-text-soft">{t('lists.googleUsageReset')}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-soft">{t('lists.thisAccount')}</h3>
          {usage.account.map((scope) => (
            <AccountScopeRow key={scope.scope} scope={scope} />
          ))}
        </div>

        {usage.global && usage.global.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-text-soft">{t('lists.allAccounts')}</h3>
            {usage.global.map((scope) => (
              <GlobalScopeRow key={scope.scope} scope={scope} />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );

  if (compact) {
    return <div>{inner}</div>;
  }

  return (
    <section className="border-b border-border-subtle bg-background/70 px-4 py-4 md:px-6">
      <div className="mx-auto max-w-5xl">{inner}</div>
    </section>
  );
}
