'use client';

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

const numberFormatter = new Intl.NumberFormat('cs-CZ');
const monthFormatter = new Intl.DateTimeFormat('cs-CZ', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatUnits(value: number) {
  return numberFormatter.format(Math.max(0, Math.floor(value)));
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
  const percent = getUsagePercent(scope.used_units, scope.account_limit);
  const tone = scope.paused ? 'danger' : percent >= 80 ? 'warning' : 'default';

  return (
    <div className="rounded-lg border border-border-subtle bg-background-elevated/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text">{SCOPE_LABELS[scope.scope]}</p>
          <p className="text-[11px] text-text-soft">
            {formatUnits(scope.used_units)} / {formatUnits(scope.account_limit)} bezplatných znaků na tomto účtu
          </p>
        </div>
        <div className={`text-xs font-medium ${scope.paused ? 'text-danger' : 'text-text-soft'}`}>
          {scope.paused ? 'Pozastaveno' : `${Math.round(percent)} % využito`}
        </div>
      </div>
      <UsageBar label={`Využití ${SCOPE_LABELS[scope.scope]} na účtu`} percent={percent} tone={tone} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-soft">
        <span>{formatUnits(scope.request_count)} požadavků tento měsíc</span>
        <span>{formatUnits(scope.free_monthly_units)} bezplatných znaků měsíčně celkem</span>
      </div>
      {scope.paused && scope.limit_message ? (
        <p className="mt-2 text-xs text-danger">{scope.limit_message}</p>
      ) : null}
    </div>
  );
}

function GlobalScopeRow({ scope }: { scope: GoogleUsageGlobalScope }) {
  const percent = getUsagePercent(scope.used_units, scope.free_monthly_units);
  const tone = percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : 'default';

  return (
    <div className="rounded-lg border border-border-subtle bg-background-elevated/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text">{SCOPE_LABELS[scope.scope]}</p>
          <p className="text-[11px] text-text-soft">
            {formatUnits(scope.used_units)} / {formatUnits(scope.free_monthly_units)} bezplatných znaků napříč účty
          </p>
        </div>
        <div className="text-xs font-medium text-text-soft">{Math.round(percent)} % využito</div>
      </div>
      <UsageBar label={`Celkové využití ${SCOPE_LABELS[scope.scope]}`} percent={percent} tone={tone} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-soft">
        <span>{formatUnits(scope.account_count)} aktivních účtů</span>
        <span>{formatUnits(scope.request_count)} požadavků tento měsíc</span>
      </div>
    </div>
  );
}

type GoogleUsagePanelProps = {
  usage: GoogleUsageResponse;
  compact?: boolean;
};

export function GoogleUsagePanel({ usage, compact = false }: GoogleUsagePanelProps) {
  const monthLabel = monthFormatter.format(new Date(usage.period_start));

  const inner = (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-text">Využití Google API</h2>
          <p className="text-xs text-text-soft">Využití bezplatné vrstvy za {monthLabel}</p>
        </div>
        <p className="text-[11px] text-text-soft">Limity se resetují první den každého měsíce.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-soft">Tento účet</h3>
          {usage.account.map((scope) => (
            <AccountScopeRow key={scope.scope} scope={scope} />
          ))}
        </div>

        {usage.global && usage.global.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-text-soft">Všechny účty</h3>
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
