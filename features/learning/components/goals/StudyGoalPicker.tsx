'use client';

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { resolveGoalTargets } from '@/packages/domain/goals/calibration';
import {
  MAX_GOAL_MINUTES,
  MAX_NEW_WORD_GOAL,
  clampGoalMinutes,
  clampGoalWords,
  defaultGoalWeekdays,
  normalizeGoalWeekdays,
  type GoalMode,
  type GoalWeekday,
  type StudyPacing,
} from '@/packages/domain/goals/goal';

const DIAL_MIN = 1;
const DIAL_MAX = 30;
const ARC_START_DEGREES = 120;
const ARC_DEGREES = 300;
const RING_RADIUS = 82;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_ARC_LENGTH = RING_CIRCUMFERENCE * (ARC_DEGREES / 360);
const DEFAULT_WEEKDAYS: GoalWeekday[] = defaultGoalWeekdays(4);
const ALL_WEEKDAYS: GoalWeekday[] = defaultGoalWeekdays(7);

export type GoalPickerValue = {
  mode: GoalMode;
  daysPerWeek: number;
  weekdays: GoalWeekday[];
  minutesPerDay: number;
  newWordsPerDay: number;
};

function WordsIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v15h4.5a2.5 2.5 0 0 1 2.5 2.5v-15Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function TimeIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m14 6 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function goalDialValueFromPoint(
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  clientX: number,
  clientY: number,
): number {
  const x = clientX - (rect.left + rect.width / 2);
  const y = clientY - (rect.top + rect.height / 2);
  const angle = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  const directed = (angle - ARC_START_DEGREES + 360) % 360;
  const onArc = directed <= ARC_DEGREES
    ? directed
    : directed < ARC_DEGREES + (360 - ARC_DEGREES) / 2
      ? ARC_DEGREES
      : 0;
  return Math.round(DIAL_MIN + (onArc / ARC_DEGREES) * (DIAL_MAX - DIAL_MIN));
}

function CircularGoalDial({
  label,
  unit,
  customLabel,
  editLabel,
  value,
  rawValue,
  invalid,
  validationMessage,
  onRawValueChange,
  onRawValueCommit,
  onChange,
}: {
  label: string;
  unit: string;
  customLabel: string;
  editLabel: string;
  value: number;
  rawValue: string | null;
  invalid: boolean;
  validationMessage: string;
  onRawValueChange: (next: string) => void;
  onRawValueCommit: () => void;
  onChange: (next: number) => void;
}) {
  const ringRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shownOnRing = Math.min(DIAL_MAX, Math.max(DIAL_MIN, value));
  const progress = (shownOnRing - DIAL_MIN) / (DIAL_MAX - DIAL_MIN);
  const handleAngle = (ARC_START_DEGREES + progress * ARC_DEGREES) * Math.PI / 180;
  const handleX = 100 + Math.cos(handleAngle) * RING_RADIUS;
  const handleY = 100 + Math.sin(handleAngle) * RING_RADIUS;
  const progressLength = Math.max(0.01, RING_ARC_LENGTH * progress);

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const ring = ringRef.current;
    if (!ring) return;
    onChange(goalDialValueFromPoint(ring.getBoundingClientRect(), event.clientX, event.clientY));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = shownOnRing + 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = shownOnRing - 1;
    if (event.key === 'Home') next = DIAL_MIN;
    if (event.key === 'End') next = DIAL_MAX;
    if (next === null) return;
    event.preventDefault();
    onChange(Math.max(DIAL_MIN, Math.min(DIAL_MAX, next)));
  };

  return (
    <div className="mt-6 flex flex-col items-center">
      <p className="m-0 text-lg font-black text-[color:var(--ob-ink,#2A2218)]">{label}</p>
      <div
        ref={ringRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={DIAL_MIN}
        aria-valuemax={DIAL_MAX}
        aria-valuenow={shownOnRing}
        aria-valuetext={`${value} ${unit}`}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event);
        }}
        className="relative mt-3 aspect-square w-full max-w-[17rem] touch-none select-none rounded-full outline-none focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--ob-accent,#1E6FA8)_28%,transparent)] sm:max-w-[19rem]"
      >
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {/* The outline is the same arc drawn wider underneath, so the track
              and the filled part share one continuous ink channel rather than
              needing four separately capped strokes. */}
          <circle
            cx="100"
            cy="100"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--ob-ink, #2A2218)"
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray={`${RING_ARC_LENGTH} ${RING_CIRCUMFERENCE - RING_ARC_LENGTH}`}
            transform={`rotate(${ARC_START_DEGREES} 100 100)`}
          />
          <circle
            cx="100"
            cy="100"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--ob-surface, #F4EFE2)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${RING_ARC_LENGTH} ${RING_CIRCUMFERENCE - RING_ARC_LENGTH}`}
            transform={`rotate(${ARC_START_DEGREES} 100 100)`}
          />
          <circle
            cx="100"
            cy="100"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--ob-accent, #1E6FA8)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${progressLength} ${RING_CIRCUMFERENCE - progressLength}`}
            transform={`rotate(${ARC_START_DEGREES} 100 100)`}
          />
          <circle
            cx={handleX}
            cy={handleY}
            r="10"
            fill="var(--ob-surface-hover, #FFF8E8)"
            stroke="var(--ob-ink, #2A2218)"
            strokeWidth="3"
          />
        </svg>

        {/* The centre is a text field, not part of the dial: without this the
            tap that focuses the number also lands on the ring and jumps the
            value to whatever angle the finger happened to be at. */}
        <div
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          className="absolute inset-[17%] flex touch-auto flex-col items-center justify-center rounded-full border-2 border-[color:var(--ob-ink,#2A2218)] bg-[color:var(--ob-surface-hover,#FFF8E8)]"
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={rawValue ?? value}
            placeholder={String(value)}
            aria-label={label}
            aria-invalid={invalid}
            aria-describedby={invalid ? 'goal-value-error' : undefined}
            /* Focusing clears the field so the next keystroke replaces the goal
               instead of appending to it. Selecting the text would do the same,
               but the number is deliberately not selectable — dragging the dial
               used to leave it highlighted. */
            onFocus={() => onRawValueChange('')}
            onBlur={onRawValueCommit}
            onChange={(event) => onRawValueChange(event.target.value)}
            className="w-[78%] select-none border-0 bg-transparent p-0 text-center text-5xl font-black tabular-nums text-[color:var(--ob-ink,#2A2218)] outline-none placeholder:text-[color:var(--ob-ink,#2A2218)] sm:text-6xl"
          />
          <span className="mt-1 text-xs font-extrabold uppercase tracking-[0.13em] text-[color:var(--ob-ink-soft,#6B5E48)]">
            {unit}
          </span>
          <button
            type="button"
            aria-label={editLabel}
            title={editLabel}
            onClick={() => inputRef.current?.focus()}
            className="mt-2 flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[color:var(--ob-ink,#2A2218)] bg-[color:var(--ob-surface,#F4EFE2)] text-[color:var(--ob-ink,#2A2218)] transition-colors hover:bg-[color:var(--ob-accent,#1E6FA8)] hover:text-[color:var(--ob-surface,#F4EFE2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ob-accent,#1E6FA8)]"
          >
            <PencilIcon />
          </button>
        </div>
      </div>
      {value > DIAL_MAX ? (
        <span className="mt-3 rounded-lg border-2 border-[color:var(--ob-accent,#1E6FA8)] px-3 py-1 text-[0.65rem] font-black uppercase tracking-wide text-[color:var(--ob-accent,#1E6FA8)]">
          {customLabel}
        </span>
      ) : null}
      {invalid ? (
        <p id="goal-value-error" role="alert" className="mb-0 mt-2 text-xs font-bold text-[color:var(--ob-wrong,#B91C1C)]">
          {validationMessage}
        </p>
      ) : null}
    </div>
  );
}

export function StudyGoalPicker({
  pacing,
  initial,
  onSubmit,
  pending = false,
  submitLabel,
}: {
  pacing: StudyPacing;
  initial?: Partial<GoalPickerValue>;
  onSubmit: (value: GoalPickerValue) => void;
  pending?: boolean;
  submitLabel?: string;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<GoalMode>(initial?.mode ?? 'words');
  const initialWeekdays = normalizeGoalWeekdays(initial?.weekdays)
    ?? defaultGoalWeekdays(initial?.daysPerWeek ?? 4);
  const [weekdays, setWeekdays] = useState<GoalWeekday[]>(initialWeekdays);
  const [minutesPerDay, setMinutesPerDay] = useState(initial?.minutesPerDay ?? 10);
  const [newWordsPerDay, setNewWordsPerDay] = useState(initial?.newWordsPerDay ?? 5);
  const [rawByMode, setRawByMode] = useState<Record<GoalMode, string | null>>({
    words: null,
    minutes: null,
  });
  /** What "every day" toggles back to, so the shortcut is reversible. */
  const weekdaysBeforeAllRef = useRef<GoalWeekday[]>(initialWeekdays);

  const isWords = mode === 'words';
  const value = isWords ? newWordsPerDay : minutesPerDay;
  const rawValue = rawByMode[mode];
  const customLimit = isWords ? MAX_NEW_WORD_GOAL : MAX_GOAL_MINUTES;
  const parsedRawValue = rawValue === null ? null : Number(rawValue);
  // An empty field is someone mid-edit, not a mistake: it appears on every
  // focus. Only a typed value that cannot become a goal is an error.
  const emptyRawValue = rawValue !== null && rawValue.trim() === '';
  const invalid = rawValue !== null && !emptyRawValue && (
    parsedRawValue === null ||
    !Number.isInteger(parsedRawValue) ||
    parsedRawValue < 1 ||
    parsedRawValue > customLimit
  );
  const validationMessage = parsedRawValue !== null && parsedRawValue > customLimit
    ? t('goal.customValueLimit', { max: customLimit })
    : t('goal.customValueRange', { max: customLimit });

  const estimate = useMemo(() => resolveGoalTargets({
    mode,
    minutesPerDay,
    wordsPerDay: isWords ? newWordsPerDay : 0,
    newWordsPerDay: isWords ? newWordsPerDay : null,
    pacing,
  }), [isWords, minutesPerDay, mode, newWordsPerDay, pacing]);
  const monthly = Math.round(newWordsPerDay * weekdays.length * 52 / 12);

  const setValue = (next: number) => {
    setRawByMode((current) => ({ ...current, [mode]: null }));
    if (isWords) setNewWordsPerDay(clampGoalWords(next));
    else setMinutesPerDay(clampGoalMinutes(next));
  };
  const updateRawValue = (next: string) => {
    setRawByMode((current) => ({ ...current, [mode]: next }));
    const parsed = Number(next);
    if (!next || !Number.isInteger(parsed) || parsed < 1 || parsed > customLimit) return;
    if (isWords) setNewWordsPerDay(parsed);
    else setMinutesPerDay(parsed);
  };
  /** Leaving the field empty keeps the goal it had, rather than blanking it. */
  const commitRawValue = () => {
    setRawByMode((current) => (
      current[mode] !== null && current[mode]?.trim() === ''
        ? { ...current, [mode]: null }
        : current
    ));
  };
  const toggleWeekday = (day: GoalWeekday) => {
    setWeekdays((current) => {
      if (current.includes(day)) {
        return current.length === 1 ? current : current.filter((entry) => entry !== day);
      }
      return [...current, day].sort((a, b) => a - b);
    });
  };
  const everyDay = weekdays.length === 7;
  const toggleEveryDay = () => {
    if (everyDay) {
      const previous = weekdaysBeforeAllRef.current;
      setWeekdays(previous.length === 7 ? DEFAULT_WEEKDAYS : previous);
      return;
    }
    weekdaysBeforeAllRef.current = weekdays;
    setWeekdays(ALL_WEEKDAYS);
  };

  const weekdayLabels = [
    t('goal.weekdayMon'),
    t('goal.weekdayTue'),
    t('goal.weekdayWed'),
    t('goal.weekdayThu'),
    t('goal.weekdayFri'),
    t('goal.weekdaySat'),
    t('goal.weekdaySun'),
  ];

  return (
    <section className="onboarding-card mx-auto w-full max-w-2xl p-4 text-left sm:p-7">
      <div
        role="radiogroup"
        aria-label={t('goal.pickerLegend')}
        className="grid grid-cols-2 gap-1.5 rounded-2xl border-2 border-[color:var(--ob-ink,#2A2218)] p-1.5"
      >
        {(['words', 'minutes'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={mode === option}
            onClick={() => setMode(option)}
            className={[
              'flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ob-accent,#1E6FA8)]',
              mode === option
                ? 'bg-[color:var(--ob-accent,#1E6FA8)] text-[color:var(--ob-surface,#F4EFE2)]'
                : 'text-[color:var(--ob-ink,#2A2218)] hover:bg-[color:var(--ob-surface-hover,#FFF8E8)]',
            ].join(' ')}
          >
            {option === 'words' ? <WordsIcon /> : <TimeIcon />}
            {t(option === 'words' ? 'goal.modeWords' : 'goal.modeMinutes')}
          </button>
        ))}
      </div>

      <CircularGoalDial
        label={t(isWords ? 'goal.newWordsPerDay' : 'goal.minutesPerDay')}
        unit={t(isWords ? 'goal.wordsUnit' : 'goal.minutesUnit')}
        customLabel={t('goal.customValueBadge')}
        editLabel={t('goal.editValue')}
        value={value}
        rawValue={rawValue}
        invalid={invalid}
        validationMessage={validationMessage}
        onRawValueChange={updateRawValue}
        onRawValueCommit={commitRawValue}
        onChange={setValue}
      />

      <fieldset className="mt-7 border-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-extrabold">{t('goal.studyDays')}</legend>
          <button
            type="button"
            aria-pressed={everyDay}
            onClick={toggleEveryDay}
            className={[
              'rounded-lg border-2 border-[color:var(--ob-ink,#2A2218)] px-3 py-1.5 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ob-accent,#1E6FA8)]',
              everyDay
                ? 'bg-[color:var(--ob-accent,#1E6FA8)] text-[color:var(--ob-surface,#F4EFE2)]'
                : 'bg-[color:var(--ob-surface,#F4EFE2)] text-[color:var(--ob-ink,#2A2218)] hover:bg-[color:var(--ob-surface-hover,#FFF8E8)]',
            ].join(' ')}
          >
            {t('goal.everyDay')}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {weekdayLabels.map((label, index) => {
            const day = (index + 1) as GoalWeekday;
            const selected = weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={selected}
                aria-label={label}
                onClick={() => toggleWeekday(day)}
                className={[
                  'aspect-square rounded-xl border-2 border-[color:var(--ob-ink,#2A2218)] text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ob-accent,#1E6FA8)] sm:text-sm',
                  selected
                    ? 'bg-[color:var(--ob-accent,#1E6FA8)] text-[color:var(--ob-surface,#F4EFE2)]'
                    : 'bg-[color:var(--ob-surface,#F4EFE2)] text-[color:var(--ob-ink-soft,#6B5E48)] hover:bg-[color:var(--ob-surface-hover,#FFF8E8)]',
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mb-0 mt-2 text-xs font-bold text-[color:var(--ob-ink-soft,#6B5E48)]">
          {t('goal.daysSelected', { count: weekdays.length })}
        </p>
      </fieldset>

      {/* Words mode alone gets an estimate. The minutes estimate said how many
          items fit in the time the learner just chose, which is the one thing
          they already know. */}
      {isWords ? (
        <p className="mb-0 mt-6 text-sm font-semibold leading-relaxed text-[color:var(--ob-ink-soft,#6B5E48)]">
          {`${t('goal.estimateWords', {
            fresh: newWordsPerDay,
            review: estimate.desiredReviewTarget,
          })} · ${t('goal.estimateMonthly', { count: monthly })}`}
        </p>
      ) : null}

      <button
        type="button"
        disabled={pending || invalid}
        onClick={() => onSubmit({
          mode,
          weekdays,
          daysPerWeek: weekdays.length,
          minutesPerDay,
          newWordsPerDay,
        })}
        className="onboarding-option onboarding-option-highlight mt-6 w-full px-5 py-3.5 text-base font-extrabold transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--ob-accent,#1E6FA8)_28%,transparent)] active:translate-y-0 disabled:cursor-wait disabled:opacity-50"
      >
        {submitLabel ?? t('settings.studyGoalSave')}
      </button>
    </section>
  );
}
