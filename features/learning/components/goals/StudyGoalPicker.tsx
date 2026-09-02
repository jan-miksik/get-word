'use client';

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { OnboardingActionSpinner } from '@/features/learning/onboarding/OnboardingScreen';
import { resolveGoalTargets } from '@/packages/domain/goals/calibration';
import {
  MAX_NEW_WORD_GOAL,
  clampGoalWords,
  defaultGoalWeekdays,
  normalizeGoalWeekdays,
  type GoalMode,
  type GoalWeekday,
  type StudyPacing,
} from '@/packages/domain/goals/goal';

const DIAL_MIN = 1;
const DIAL_MAX = 20;
const ARC_START_DEGREES = 120;
const ARC_DEGREES = 300;
const RING_RADIUS = 82;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_ARC_LENGTH = RING_CIRCUMFERENCE * (ARC_DEGREES / 360);
const DEFAULT_WEEKDAYS: GoalWeekday[] = defaultGoalWeekdays(7);
const ALL_WEEKDAYS: GoalWeekday[] = defaultGoalWeekdays(7);

/**
 * The goal screen's vertical rhythm, in two rungs of window height.
 *
 * This step carries the tallest control in the flow — a dial, a week, an
 * estimate and Save — and on a phone the whole thing has to be reachable
 * without scrolling: a Save button below the fold reads as a screen with
 * nothing to press. The rungs are a tall phone (iPhone 14 and friends, ~845)
 * and a short one (iPhone SE, 667); above them nothing changes.
 *
 * Both rungs are written as closed ranges so the shorter one cannot be
 * out-ordered by the taller one — two open-ended `max-height` variants of the
 * same property both match on a small phone, and which of them wins would be
 * Tailwind's sort order rather than ours.
 */
const DIAL_SIZE_TIERS =
  '[@media(min-height:721px)_and_(max-height:900px)]:max-w-[min(17rem,30vh)] [@media(max-height:720px)]:max-w-[min(17rem,28vh)]';
const DIAL_GAP_TIERS =
  '[@media(min-height:721px)_and_(max-height:900px)]:mt-2 [@media(max-height:720px)]:mt-1';
const COLUMN_GAP_TIERS =
  '[@media(min-height:721px)_and_(max-height:900px)]:gap-4 [@media(max-height:720px)]:gap-3';
const BLOCK_GAP_TIERS =
  '[@media(min-height:721px)_and_(max-height:900px)]:mt-4 [@media(max-height:720px)]:mt-3';

export type GoalPickerValue = {
  mode: GoalMode;
  daysPerWeek: number;
  weekdays: GoalWeekday[];
  minutesPerDay: number;
  newWordsPerDay: number;
};

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

  // The dial is the tallest thing on the goal screen, so its size is capped by
  // the window as well as by its column: on a short laptop window the `vh` half
  // of the clamp keeps the Save button above the fold instead of pushing it
  // under. Touch is unaffected — phones are tall.
  return (
    <div className="flex flex-col items-center">
      <p className="m-0 text-lg font-black text-[color:var(--ob-ink,var(--ink))]">{label}</p>
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
        className={`relative mt-3 aspect-square w-full max-w-[min(17rem,34vh)] touch-none select-none rounded-full outline-none focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--ob-accent,var(--sea))_28%,transparent)] sm:max-w-[min(19rem,38vh)] ${DIAL_SIZE_TIERS} ${DIAL_GAP_TIERS}`}
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
            stroke="var(--ob-ink, var(--ink))"
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
            stroke="var(--ob-surface, var(--paper))"
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
            stroke="var(--ob-accent, var(--sea))"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${progressLength} ${RING_CIRCUMFERENCE - progressLength}`}
            transform={`rotate(${ARC_START_DEGREES} 100 100)`}
          />
          <circle
            cx={handleX}
            cy={handleY}
            r="10"
            fill="var(--ob-surface-hover, var(--paper-hi))"
            stroke="var(--ob-ink, var(--ink))"
            strokeWidth="3"
          />
        </svg>

        {/* The centre is a text field, not part of the dial: without this the
            tap that focuses the number also lands on the ring and jumps the
            value to whatever angle the finger happened to be at. */}
        <div
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          className="absolute inset-[17%] flex touch-auto flex-col items-center justify-center rounded-full border-2 border-[color:var(--ob-ink,var(--ink))] bg-[color:var(--ob-surface-hover,var(--paper-hi))]"
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
            className="w-[78%] select-none border-0 bg-transparent p-0 text-center text-5xl font-black tabular-nums text-[color:var(--ob-ink,var(--ink))] outline-none placeholder:text-[color:var(--ob-ink,var(--ink))] sm:text-6xl"
          />
          <span className="mt-1 text-xs font-extrabold uppercase tracking-[0.13em] text-[color:var(--ob-ink-soft,var(--ink-soft))]">
            {unit}
          </span>
          <button
            type="button"
            aria-label={editLabel}
            title={editLabel}
            onClick={() => inputRef.current?.focus()}
            className="mt-2 flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[color:var(--ob-ink,var(--ink))] bg-[color:var(--ob-surface,var(--paper))] text-[color:var(--ob-ink,var(--ink))] transition-colors hover:bg-[color:var(--ob-accent,var(--sea))] hover:text-[color:var(--ob-surface,var(--paper))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ob-accent,var(--sea))]"
          >
            <PencilIcon />
          </button>
        </div>
      </div>
      {value > DIAL_MAX ? (
        <span className="mt-3 rounded-lg border-2 border-[color:var(--ob-accent,var(--sea))] px-3 py-1 text-[0.65rem] font-black uppercase tracking-wide text-[color:var(--ob-accent,var(--sea))]">
          {customLabel}
        </span>
      ) : null}
      {invalid ? (
        <p id="goal-value-error" role="alert" className="mb-0 mt-2 text-xs font-bold text-[color:var(--ob-wrong,var(--brick))]">
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
  framed = false,
  submitLabel,
  pendingLabel,
}: {
  pacing: StudyPacing;
  initial?: Partial<GoalPickerValue>;
  onSubmit: (value: GoalPickerValue) => void;
  pending?: boolean;
  /**
   * Draw the picker's own card. Off inside `OnboardingScreen`, which already
   * provides the sheet — a card in a card only costs vertical space.
   */
  framed?: boolean;
  submitLabel?: string;
  /** Shown in place of the submit label while the goal is being written. */
  pendingLabel?: string;
}) {
  const { t } = useI18n();
  // Time goals remain supported in storage and sessions, but setup/editing is
  // words-only until the time-goal experience is ready.
  const mode = 'words';
  const initialWeekdays = normalizeGoalWeekdays(initial?.weekdays)
    ?? defaultGoalWeekdays(initial?.daysPerWeek ?? 7);
  const [weekdays, setWeekdays] = useState<GoalWeekday[]>(initialWeekdays);
  const [minutesPerDay] = useState(initial?.minutesPerDay ?? 10);
  const [newWordsPerDay, setNewWordsPerDay] = useState(initial?.newWordsPerDay ?? 5);
  const [rawValue, setRawValue] = useState<string | null>(null);
  /** What "every day" toggles back to, so the shortcut is reversible. */
  const weekdaysBeforeAllRef = useRef<GoalWeekday[]>(initialWeekdays);

  const customLimit = MAX_NEW_WORD_GOAL;
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
    wordsPerDay: newWordsPerDay,
    newWordsPerDay,
    pacing,
  }), [minutesPerDay, newWordsPerDay, pacing]);
  const monthly = Math.round(newWordsPerDay * weekdays.length * 52 / 12);

  const setValue = (next: number) => {
    setRawValue(null);
    setNewWordsPerDay(clampGoalWords(next));
  };
  const updateRawValue = (next: string) => {
    setRawValue(next);
    const parsed = Number(next);
    if (!next || !Number.isInteger(parsed) || parsed < 1 || parsed > customLimit) return;
    setNewWordsPerDay(parsed);
  };
  /** Leaving the field empty keeps the goal it had, rather than blanking it. */
  const commitRawValue = () => {
    setRawValue((current) => (
      current !== null && current.trim() === ''
        ? null
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
    // A container query, not a breakpoint: the same picker is a full screen in
    // setup and a narrow section in Settings, and only its own width says which
    // layout fits. Wide enough, and the dial and the week sit side by side so
    // the whole goal — including Save — is on screen without scrolling.
    <section
      className={[
        '@container mx-auto w-full text-left',
        framed ? 'onboarding-card max-w-2xl p-4 sm:p-7' : '',
      ].join(' ')}
    >
      <div className={`grid gap-6 @2xl:grid-cols-[17rem_minmax(0,1fr)] @2xl:items-stretch @2xl:gap-8 ${COLUMN_GAP_TIERS}`}>
        <CircularGoalDial
          label={t('goal.newWordsPerDay')}
          unit={t('goal.wordsUnit')}
          customLabel={t('goal.customValueBadge')}
          editLabel={t('goal.editValue')}
          value={newWordsPerDay}
          rawValue={rawValue}
          invalid={invalid}
          validationMessage={validationMessage}
          onRawValueChange={updateRawValue}
          onRawValueCommit={commitRawValue}
          onChange={setValue}
        />

        <div className="flex flex-col @2xl:justify-between">
          <fieldset className="border-0 p-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <legend className="text-sm font-extrabold">{t('goal.studyDays')}</legend>
              <button
                type="button"
                aria-pressed={everyDay}
                onClick={toggleEveryDay}
                className={[
                  'rounded-lg border-2 border-[color:var(--ob-ink,var(--ink))] px-3 py-1.5 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ob-accent,var(--sea))]',
                  everyDay
                    ? 'bg-[color:var(--ob-accent,var(--sea))] text-[color:var(--ob-surface,var(--paper))]'
                    : 'bg-[color:var(--ob-surface,var(--paper))] text-[color:var(--ob-ink,var(--ink))] hover:bg-[color:var(--ob-surface-hover,var(--paper-hi))]',
                ].join(' ')}
              >
                {t('goal.everyDay')}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1.5 [@media(max-height:720px)]:mt-2">
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
                      'aspect-square rounded-xl border-2 border-[color:var(--ob-ink,var(--ink))] text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ob-accent,var(--sea))] sm:text-sm',
                      selected
                        ? 'bg-[color:var(--ob-accent,var(--sea))] text-[color:var(--ob-surface,var(--paper))]'
                        : 'bg-[color:var(--ob-surface,var(--paper))] text-[color:var(--ob-ink-soft,var(--ink-soft))] hover:bg-[color:var(--ob-surface-hover,var(--paper-hi))]',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {/* The seven buttons already say how many days are on. On a screen
                too short for the whole goal this line is the first thing that
                can go without taking any information with it. */}
            <p className="mb-0 mt-2 text-xs font-bold text-[color:var(--ob-ink-soft,var(--ink-soft))] [@media(max-height:720px)]:hidden">
              {t('goal.daysSelected', { count: weekdays.length })}
            </p>
          </fieldset>

          <p className={`mb-0 mt-6 text-sm font-semibold leading-relaxed text-[color:var(--ob-ink-soft,var(--ink-soft))] ${BLOCK_GAP_TIERS} [@media(max-height:720px)]:text-xs [@media(max-height:720px)]:leading-snug`}>
            {`${t('goal.estimateWords', {
              fresh: newWordsPerDay,
              review: estimate.desiredReviewTarget,
            })} · ${t('goal.estimateMinutes', { count: estimate.minutesPerDay })}`}
            <br />
            {t('goal.estimateMonthly', { count: monthly })}
          </p>

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
            className={`onboarding-option onboarding-option-highlight mt-6 w-full px-5 py-3.5 text-base font-extrabold ${BLOCK_GAP_TIERS} transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--ob-accent,var(--sea))_28%,transparent)] active:translate-y-0 disabled:cursor-wait disabled:opacity-50`}
          >
            {/* Writing the goal is a round trip, and the button used to do
                nothing visible for the length of it. The spinner rides in the
                button's own colour so the slab does not change shape. */}
            {pending ? (
              <span className="inline-flex items-center justify-center gap-2">
                <OnboardingActionSpinner />
                <span>{pendingLabel ?? t('goal.setupSubmitPending')}</span>
              </span>
            ) : (
              submitLabel ?? t('settings.studyGoalSave')
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
