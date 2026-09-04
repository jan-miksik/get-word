'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';

const MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function formatStudyTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * True on touch devices. Both variants are ours: the platform's own
 * `input[type=time]` dialog was tried first and lost — inside the installed
 * Android app its confirm button renders half hidden, and there is nothing a
 * web page can do about a dialog the browser draws. The two variants differ in
 * shape only: a sheet with a confirm button on a thumb, a small popover under
 * the field on a mouse.
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
  // corrects it on hydration.
  return useSyncExternalStore(subscribeToPointerType, readCoarsePointer, () => false);
}

function Column({
  label,
  values,
  selected,
  format,
  onSelect,
  large = false,
}: {
  label: string;
  values: number[];
  selected: number;
  format: (value: number) => string;
  onSelect: (value: number) => void;
  /** Touch sizing: taller rows and a taller list to scroll them in. */
  large?: boolean;
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
        className={[
          'overflow-y-auto rounded-xl border-2 border-[color:var(--ob-ink,var(--text))] p-1',
          large ? 'h-[min(44vh,17rem)]' : 'h-44',
        ].join(' ')}
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
                'w-full rounded-lg text-center font-extrabold tabular-nums transition-colors',
                large ? 'px-2 py-3 text-lg' : 'px-2 py-1.5 text-sm',
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

const HOUR_VALUES = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * The onboarding card paints itself with these, and the sheet is portalled to
 * `body` — outside that scope, where the same names resolve to nothing and the
 * sheet would come back in the app's own theme while the card behind it is
 * cream. Carried across by value, and only when they exist: handing on an empty
 * string would make `var(--ob-ink, var(--text))` invalid rather than fall back.
 */
const SCOPED_COLOR_VARS = [
  '--ob-ink',
  '--ob-ink-soft',
  '--ob-surface',
  '--ob-surface-hover',
  '--ob-accent',
];

function readScopedColors(anchor: HTMLElement | null): CSSProperties {
  if (!anchor || typeof window === 'undefined') return {};
  const computed = window.getComputedStyle(anchor);
  const carried: Record<string, string> = {};
  for (const name of SCOPED_COLOR_VARS) {
    const value = computed.getPropertyValue(name).trim();
    if (value) carried[name] = value;
  }
  return carried as CSSProperties;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
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
  // What the sheet is editing. The popover writes straight through — it sits
  // under the field and every tap is visible there — but the sheet covers the
  // field, and each write is a goal save, so it commits once on confirm.
  const [draft, setDraft] = useState(value);
  const [sheetColors, setSheetColors] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // How far the popover has to slide sideways to stay on screen. It is anchored
  // to the field's left edge, and the field is not always near the left of the
  // window — in the settings panel it is a 8rem control in a narrow column, and
  // the 20rem panel it opens would otherwise run off the right edge and be
  // clipped by the panel's own `overflow`.
  const [shiftX, setShiftX] = useState(0);
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  // A stored time need not sit on a five-minute step — an older setting, or one
  // typed on a phone — and dropping it from the list would silently move it.
  const minuteValues = useMemo(
    () => {
      const shown = coarsePointer ? draft % 60 : minutes;
      return MINUTE_STEPS.includes(shown) ? MINUTE_STEPS : [...MINUTE_STEPS, shown].sort((a, b) => a - b);
    },
    [coarsePointer, draft, minutes],
  );

  const openPicker = () => {
    setDraft(value);
    setSheetColors(readScopedColors(containerRef.current));
    setOpen(true);
  };

  const clampIntoViewport = useCallback(() => {
    const popover = popoverRef.current;
    const anchor = containerRef.current;
    if (!popover || !anchor) return;
    // Measured from the anchor rather than from the popover's own box, so the
    // result does not depend on the shift already applied — running this again
    // on a resize converges instead of drifting.
    const margin = 8;
    const left = anchor.getBoundingClientRect().left;
    const width = popover.offsetWidth;
    const overflowRight = left + width - (window.innerWidth - margin);
    const shift = overflowRight > 0 ? -overflowRight : 0;
    setShiftX(left + shift < margin ? margin - left : shift);
  }, []);

  /**
   * Measured as the popover mounts rather than in an effect, so the panel is
   * already in place on its first paint instead of jumping sideways after it.
   */
  const attachPopover = useCallback((node: HTMLDivElement | null) => {
    popoverRef.current = node;
    if (node) clampIntoViewport();
  }, [clampIntoViewport]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    // The sheet is portalled out of this subtree and dismissed by its own
    // backdrop, so an outside-pointer rule here would close it immediately.
    if (coarsePointer) {
      return () => document.removeEventListener('keydown', onKeyDown);
    }
    window.addEventListener('resize', clampIntoViewport);
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('resize', clampIntoViewport);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [clampIntoViewport, coarsePointer, open]);

  const trigger = (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      disabled={disabled}
      onClick={() => (open ? setOpen(false) : openPicker())}
      className="h-14 w-full rounded-2xl border-2 border-[color:var(--ob-ink,var(--text))] bg-[color:var(--ob-surface-hover,var(--bg-elevated))] px-4 text-center text-xl font-black tabular-nums text-[color:var(--ob-ink,var(--text))] outline-none transition-colors hover:bg-[color:var(--ob-surface,var(--bg))] focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--ob-accent,var(--accent))_28%,transparent)] disabled:opacity-50"
    >
      {formatStudyTime(value)}
    </button>
  );

  if (coarsePointer) {
    const sheet = open ? (
      <div
        style={sheetColors}
        className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center"
        onClick={() => setOpen(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={(event) => event.stopPropagation()}
          className="w-full max-w-sm rounded-3xl border-2 border-[color:var(--ob-ink,var(--text))] bg-[color:var(--ob-surface,var(--bg))] p-4"
        >
          <p className="m-0 mb-1 text-center text-sm font-extrabold text-[color:var(--ob-ink,var(--text))]">
            {label}
          </p>
          <p className="m-0 mb-3 text-center text-3xl font-black tabular-nums text-[color:var(--ob-ink,var(--text))]">
            {formatStudyTime(draft)}
          </p>
          <div className="flex gap-2">
            <Column
              large
              label={t('goal.timeHours')}
              values={HOUR_VALUES}
              selected={Math.floor(draft / 60)}
              format={pad}
              onSelect={(hour) => setDraft(hour * 60 + (draft % 60))}
            />
            <Column
              large
              label={t('goal.timeMinutes')}
              values={minuteValues}
              selected={draft % 60}
              format={pad}
              onSelect={(minute) => setDraft(Math.floor(draft / 60) * 60 + minute)}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-2xl border-2 border-[color:var(--ob-ink,var(--text))] px-4 py-3 text-sm font-extrabold text-[color:var(--ob-ink,var(--text))]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                if (draft !== value) onChange(draft);
              }}
              className="flex-1 rounded-2xl border-2 border-[color:var(--ob-ink,var(--text))] bg-[color:var(--ob-accent,var(--accent))] px-4 py-3 text-sm font-extrabold text-[color:var(--ob-surface,var(--bg))]"
            >
              {t('common.done')}
            </button>
          </div>
        </div>
      </div>
    ) : null;

    return (
      <div ref={containerRef} className="relative">
        {trigger}
        {sheet && typeof document !== 'undefined' ? createPortal(sheet, document.body) : null}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {trigger}
      {open ? (
        <div
          ref={attachPopover}
          role="dialog"
          aria-label={label}
          style={shiftX ? { transform: `translateX(${shiftX}px)` } : undefined}
          className="absolute left-0 top-full z-30 mt-2 flex w-[min(20rem,90vw)] gap-2 rounded-2xl border-2 border-[color:var(--ob-ink,var(--text))] bg-[color:var(--ob-surface,var(--bg))] p-3"
        >
          <Column
            label={t('goal.timeHours')}
            values={HOUR_VALUES}
            selected={hours}
            format={pad}
            onSelect={(hour) => onChange(hour * 60 + minutes)}
          />
          <Column
            label={t('goal.timeMinutes')}
            values={minuteValues}
            selected={minutes}
            format={pad}
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
