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

/**
 * GitHub-style contribution heatmap. Label-agnostic: all copy arrives via props.
 * `days` is sparse (only days with activity); everything else is filled empty.
 * Weeks are Monday-aligned columns to match the rest of the stats. Set
 * `compact` for the small per-row variant (no month labels, no legend).
 */
export function ActivityHeatmap({
  days,
  endDate,
  weeks = 53,
  compact = false,
  emptyLabel,
  lessLabel,
  moreLabel,
  formatTooltip,
}: {
  days: { date: string; value: number }[];
  endDate: Date;
  weeks?: number;
  compact?: boolean;
  emptyLabel: string;
  lessLabel: string;
  moreLabel: string;
  formatTooltip: (date: string, value: number) => string;
}) {
  const cellSize = compact ? 8 : 11;
  const gap = compact ? 2 : 3;
  const opacities = [0.35, 0.3, 0.5, 0.75, 1];
  const valueByDate = new Map(days.map((d) => [d.date, d.value]));
  const max = Math.max(0, ...days.map((d) => d.value));

  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  const fromMonday = (end.getUTCDay() + 6) % 7;
  const thisMonday = new Date(end);
  thisMonday.setUTCDate(end.getUTCDate() - fromMonday);
  const start = new Date(thisMonday);
  start.setUTCDate(thisMonday.getUTCDate() - (weeks - 1) * 7);
  const todayKey = end.toISOString().slice(0, 10);

  const columns: Date[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: Date[] = [];
    for (let r = 0; r < 7; r++) {
      const cur = new Date(start);
      cur.setUTCDate(start.getUTCDate() + w * 7 + r);
      col.push(cur);
    }
    columns.push(col);
  }

  const level = (v: number) => (!v || max <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const swatchStyle = (lvl: number) => ({
    width: cellSize,
    height: cellSize,
    backgroundColor: lvl === 0 ? 'var(--border-subtle)' : 'var(--accent)',
    opacity: opacities[lvl],
  });

  if (days.length === 0) {
    return <p className="text-xs text-text-soft">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1">
        {!compact && (
          <div className="flex" style={{ gap }}>
            {columns.map((col, i) => {
              const showMonth = i === 0 || col[0].getUTCMonth() !== columns[i - 1][0].getUTCMonth();
              return (
                <div key={i} style={{ width: cellSize }} className="text-[9px] text-text-soft overflow-visible whitespace-nowrap">
                  {showMonth ? col[0].toLocaleDateString(undefined, { month: 'short' }) : ''}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex" style={{ gap }}>
          {columns.map((col, i) => (
            <div key={i} className="flex flex-col" style={{ gap }}>
              {col.map((dt) => {
                const iso = dt.toISOString().slice(0, 10);
                const future = iso > todayKey;
                const value = valueByDate.get(iso) ?? 0;
                return (
                  <div
                    key={iso}
                    title={future ? undefined : formatTooltip(iso, value)}
                    className="rounded-[2px]"
                    style={future ? { width: cellSize, height: cellSize, opacity: 0 } : swatchStyle(level(value))}
                  />
                );
              })}
            </div>
          ))}
        </div>
        {!compact && (
          <div className="flex items-center gap-1 text-[9px] text-text-soft">
            <span>{lessLabel}</span>
            {[0, 1, 2, 3, 4].map((lvl) => (
              <div key={lvl} className="rounded-[2px]" style={swatchStyle(lvl)} />
            ))}
            <span>{moreLabel}</span>
          </div>
        )}
      </div>
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
