'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useI18n } from '@/components/I18nProvider';

const MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function formatStudyTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function parseStudyTime(value: string): number | null {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  const total = hours * 60 + minutes;
  return total >= 0 && total < 24 * 60 ? total : null;
}

/**
 * True on touch devices, where the platform's own time picker is a wheel and
 * beats anything we could draw. On a mouse, `input[type=time]` means clicking
 * a two-character segment and typing into it, which is what this replaces.
 */
const COARSE_POINTER_QUERY = '(pointer: coarse)';

function subscribeToPointerType(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(COARSE_POINTER_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function readCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(COARSE_POINTER_QUERY).matches;
}

function useCoarsePointer(): boolean {
  // The server has no pointer, so it renders the desktop variant and the client
  // corrects it on hydration — the other way round would put a text field in
  // front of the phone keyboard for a frame.
  return useSyncExternalStore(subscribeToPointerType, readCoarsePointer, () => false);
}

function Column({
  label,
  values,
  selected,
  format,
  onSelect,
}: {
  label: string;
  values: number[];
  selected: number;
  format: (value: number) => string;
  onSelect: (value: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = listRef.current?.querySelector('[data-selected="true"]');
    // jsdom has no layout, so it ships elements without this method.
    if (active instanceof HTMLElement && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'center' });
    }
  }, []);

  return (
    <div className="min-w-0 flex-1">
      <p className="m-0 mb-1 text-center text-[0.65rem] font-black uppercase tracking-[0.13em] text-[color:var(--ob-ink-soft,var(--text-soft))]">
        {label}
      </p>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        className="h-44 overflow-y-auto rounded-xl border-2 border-[color:var(--ob-ink,var(--text))] p-1"
      >
        {values.map((value) => {
          const isSelected = value === selected;
          return (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-selected={isSelected}
              onClick={() => onSelect(value)}
              className={[
                'w-full rounded-lg px-2 py-1.5 text-center text-sm font-extrabold tabular-nums transition-colors',
                isSelected
                  ? 'bg-[color:var(--ob-accent,var(--accent))] text-[color:var(--ob-surface,var(--bg))]'
                  : 'text-[color:var(--ob-ink,var(--text))] hover:bg-[color:var(--ob-surface-hover,var(--bg-elevated))]',
              ].join(' ')}
            >
              {format(value)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The reminder time, as a tap target rather than a text field.
 *
 * Both variants carry the same accessible name, so callers and tests reach the
 * control the same way whichever one the device gets.
 */
export function StudyTimeField({
  label,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (minutes: number) => void;
}) {
  const { t } = useI18n();
  const coarsePointer = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  // A stored time need not sit on a five-minute step — an older setting, or one
  // typed on a phone — and dropping it from the list would silently move it.
  const minuteValues = useMemo(
    () => (MINUTE_STEPS.includes(minutes) ? MINUTE_STEPS : [...MINUTE_STEPS, minutes].sort((a, b) => a - b)),
    [minutes],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (coarsePointer) {
    return (
      <input
        type="time"
        aria-label={label}
        value={formatStudyTime(value)}
        disabled={disabled}
        onChange={(event) => {
          const parsed = parseStudyTime(event.target.value);
          if (parsed !== null) onChange(parsed);
        }}
        className="h-14 w-full rounded-2xl border-2 border-[color:var(--ob-ink,var(--text))] bg-[color:var(--ob-surface-hover,var(--bg-elevated))] px-4 text-center text-xl font-black tabular-nums text-[color:var(--ob-ink,var(--text))] outline-none focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--ob-accent,var(--accent))_28%,transparent)]"
      />
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="h-14 w-full rounded-2xl border-2 border-[color:var(--ob-ink,var(--text))] bg-[color:var(--ob-surface-hover,var(--bg-elevated))] px-4 text-center text-xl font-black tabular-nums text-[color:var(--ob-ink,var(--text))] outline-none transition-colors hover:bg-[color:var(--ob-surface,var(--bg))] focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--ob-accent,var(--accent))_28%,transparent)] disabled:opacity-50"
      >
        {formatStudyTime(value)}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          className="absolute left-0 top-full z-30 mt-2 flex w-[min(20rem,90vw)] gap-2 rounded-2xl border-2 border-[color:var(--ob-ink,var(--text))] bg-[color:var(--ob-surface,var(--bg))] p-3"
        >
          <Column
            label={t('goal.timeHours')}
            values={Array.from({ length: 24 }, (_, hour) => hour)}
            selected={hours}
            format={(hour) => String(hour).padStart(2, '0')}
            onSelect={(hour) => onChange(hour * 60 + minutes)}
          />
          <Column
            label={t('goal.timeMinutes')}
            values={minuteValues}
            selected={minutes}
            format={(minute) => String(minute).padStart(2, '0')}
            onSelect={(minute) => {
              onChange(hours * 60 + minute);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
