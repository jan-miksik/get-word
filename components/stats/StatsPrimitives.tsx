'use client';

import type { ActivityWindow } from '@/lib/stats/types';

/**
 * Presentational building blocks shared by the app-wide admin dashboard and the
 * per-school dashboard. Deliberately label-agnostic: every string arrives via
 * props so neither feature's translation keys leak into the other.
 */

export function Section({
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

export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{children}</div>;
}

export function StatCard({
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

export function ActivityWindowToggle({
  value,
  onChange,
  rollingLabel,
  calendarLabel,
  ariaLabel,
}: {
  value: ActivityWindow;
  onChange: (value: ActivityWindow) => void;
  rollingLabel: string;
  calendarLabel: string;
  ariaLabel: string;
}) {
  const options: { value: ActivityWindow; label: string }[] = [
    { value: 'rolling', label: rollingLabel },
    { value: 'calendar', label: calendarLabel },
  ];

  return (
    <div
      className="inline-flex rounded-lg border border-border-subtle bg-background-elevated p-1 text-xs"
      role="group"
      aria-label={ariaLabel}
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

export function TrendBars({
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
