'use client';

import { useEffect, useState } from 'react';

import { useI18n } from '@/components/I18nProvider';
import type { I18nKey } from '@/lib/i18n/messages';
import type { ActivityClockState } from '@/lib/activity/runtime';
import { formatDuration } from '@/features/learning/goals/useStudyCountdown';
import {
  useActiveDayMs,
  useActivityClockState,
} from '@/features/learning/goals/useActiveDayMs';
import {
  TIME_ENDGAME_MS,
  TIME_PHASE_SHARES,
  computeTimeCountdown,
} from '@/features/learning/session/timeCountdown';

const MINUTE_MS = 60_000;
const MAX_TIME_TICKS = 24;

/**
 * What the countdown needs from the goal. Present only for a `minutes` goal;
 * a words goal never has one, which is what keeps its rails untouched.
 */
export interface SessionTimeGoal {
  /** Local day the measured time belongs to. */
  dayKey: string;
  /** The zone that day key was computed in; the ledger buckets time the same. */
  timezone: string;
  /** The day's time budget in milliseconds. */
  budgetMs: number;
  /** Active time the server has already recorded for the day. */
  serverActiveMs: number;
  /** Frozen shares of the day's content stretches. */
  phaseShares?: readonly number[];
  /** Content kind of each stretch, in the same order as `phaseShares`. */
  phaseKinds?: readonly ('new' | 'review')[];
}

/**
 * `loud` is the strip as it was first drawn, kept only so `/dev/study-goal` can
 * put the two side by side. The app uses `quiet`.
 */
export const SESSION_TIME_STRIP_VARIANTS = ['quiet', 'loud'] as const;

export type SessionTimeStripVariant = (typeof SESSION_TIME_STRIP_VARIANTS)[number];

const SESSION_TIME_STRIP_DEFAULT_VARIANT: SessionTimeStripVariant = 'quiet';

/**
 * How long the quiet strip stays at full strength once it has something to say.
 *
 * The same idea as a scrollbar that shows itself while the page is moving and
 * then gets out of the way: at the top of the session and at every turn of the
 * day the strip is worth a glance, and between those it is reference material.
 */
const ATTENTION_MS = 4_000;

/** Resting opacity of a quiet strip with nothing new to report. */
const RESTING_OPACITY = 0.45;

/**
 * Why the digits are standing still, in the two lengths the strip needs: a
 * couple of words that fit beside the number, and the sentence behind them.
 *
 * `counting` has no entry — a running clock explains itself.
 */
const CLOCK_REASONS: Partial<
  Record<ActivityClockState, { short: I18nKey; hint: I18nKey }>
> = {
  idle: { short: 'goal.clockIdleShort', hint: 'goal.clockAsleep' },
  elsewhere: { short: 'goal.clockElsewhereShort', hint: 'goal.clockElsewhere' },
  paused: { short: 'goal.clockPausedShort', hint: 'goal.clockPaused' },
  unmeasured: { short: 'goal.clockOffShort', hint: 'goal.clockOff' },
};

type StripSkin = {
  /** Where the strip sits across the top of the study area. */
  row: string;
  /** The frame around the number — a pill, or nothing at all. */
  frame: string;
  /** The digits at rest; the endgame overrides the colour from here. */
  digits: string;
};

const SKINS: Record<SessionTimeStripVariant, StripSkin> = {
  // Off the reading axis and without chrome; the rails carry the progress.
  quiet: {
    row: 'justify-end pr-4',
    frame: 'gap-2 py-1',
    digits: 'text-[0.8rem] font-bold',
  },
  loud: {
    row: 'justify-center px-3',
    frame:
      'gap-2 rounded-full border border-ink/10 bg-paper-hi/60 px-3 py-1 shadow-[0_2px_10px_rgba(42,34,24,0.07)]',
    digits: 'text-[0.95rem] font-black',
  },
};

function railFrame(side: 'left' | 'right'): string {
  return [
    'pointer-events-none absolute bottom-0 top-7 z-10 flex w-[5px] flex-col-reverse gap-[3px] py-2',
    side === 'left' ? 'left-0' : 'right-0',
  ].join(' ');
}

function phaseKinds(goal: SessionTimeGoal, phaseCount: number): readonly ('new' | 'review')[] {
  if (goal.phaseKinds?.length === phaseCount) return goal.phaseKinds;
  return phaseCount === 2 ? ['new', 'review'] : ['review', 'new', 'review'];
}

/** One completed mark per whole minute in the stretch currently being walked. */
function CurrentTimeRail({
  activeMs,
  budgetMs,
  shares,
  kinds,
  phase,
}: {
  activeMs: number;
  budgetMs: number;
  shares: readonly number[];
  kinds: readonly ('new' | 'review')[];
  phase: number;
}) {
  const current = Math.min(Math.max(phase, 0), Math.max(0, shares.length - 1));
  const startShare = shares.slice(0, current).reduce((sum, share) => sum + share, 0);
  const durationMs = Math.max(0, budgetMs * (shares[current] ?? 0));
  const elapsedMs = Math.max(0, Math.min(durationMs, activeMs - budgetMs * startShare));
  const wholeMinutes = Math.max(1, Math.floor(durationMs / MINUTE_MS));
  const ticks = Math.min(wholeMinutes, MAX_TIME_TICKS);
  const filled = durationMs <= 0
    ? 0
    : Math.min(ticks, Math.floor((elapsedMs / durationMs) * ticks));
  const color = kinds[current] === 'new' ? 'var(--rail-new)' : 'var(--rail-review)';

  return (
    <div aria-hidden data-time-current-rail className={railFrame('left')}>
      {Array.from({ length: ticks }, (_, index) => (
        <span
          key={index}
          data-filled={index < filled ? 'true' : 'false'}
          className="flex-1 rounded-[2px] motion-safe:transition-colors motion-safe:duration-500"
          style={index < filled
            ? { background: color, boxShadow: `0 0 8px 0 ${color}` }
            : { background: 'var(--rail-track)' }}
        />
      ))}
    </div>
  );
}

/** The frozen allocation for the whole day, preserved in chronological order. */
function DayTimeRail({
  activeMs,
  budgetMs,
  shares,
  kinds,
}: {
  activeMs: number;
  budgetMs: number;
  shares: readonly number[];
  kinds: readonly ('new' | 'review')[];
}) {
  return (
    <div aria-hidden data-time-day-rail className={railFrame('right')}>
      {shares.map((share, index) => {
        const phaseStartMs = shares
          .slice(0, index)
          .reduce((sum, precedingShare) => sum + precedingShare, 0) * budgetMs;
        const durationMs = Math.max(0, share * budgetMs);
        const fill = durationMs > 0
          ? Math.max(0, Math.min(1, (activeMs - phaseStartMs) / durationMs))
          : 0;
        const color = kinds[index] === 'new' ? 'var(--rail-new)' : 'var(--rail-review)';
        return (
          <span
            key={index}
            data-time-segment-kind={kinds[index] ?? 'review'}
            className="relative w-full overflow-hidden rounded-[2px]"
            style={{ flexGrow: share, flexBasis: 0, minHeight: '6px', background: 'var(--rail-track)' }}
          >
            <span
              className="absolute inset-x-0 bottom-0 rounded-[2px] motion-safe:transition-[height] motion-safe:duration-500"
              style={{ height: `${fill * 100}%`, background: color }}
            />
          </span>
        );
      })}
    </div>
  );
}

/**
 * The clock and edge rails of a minutes day.
 *
 * It mirrors a words day: the left edge counts completed minutes in the current
 * stretch, while the right edge keeps the frozen shape of the whole day in
 * review/new colours. The number remains above the deck and answers the one
 * exact question the rails deliberately do not: how much time is left.
 *
 * Everything else here is about *not* being looked at. A countdown beside a
 * flashcard competes with the one thing on screen that deserves attention, and
 * it was winning: seconds ticking in the corner of an eye, a fill sliding
 * continuously under them, black digits inside a shadowed pill sitting directly
 * in the path from the top of the screen to the card. So the number moves once
 * a minute instead of once a second (`TIME_ENDGAME_MS`), the pill is gone, and
 * the whole strip fades to
 * `RESTING_OPACITY` a few seconds after the last thing worth noticing. It comes
 * back to full strength exactly when it has news: the day turned a phase, the
 * clock stopped, or the last minute has started.
 *
 * Standing still is a state the strip has to be able to explain. There are four
 * ways a countdown stops without the day being over, and a clock that freezes
 * mutely is indistinguishable from a broken one — so whenever the digits are
 * not moving, the reason is written out beside them. In words, not a tooltip: a
 * title attribute is nothing at all on a phone, which is where this is read.
 */
export function SessionTimeStrip({
  goal,
  variant = SESSION_TIME_STRIP_DEFAULT_VARIANT,
  clock: assumedClock,
}: {
  goal: SessionTimeGoal;
  variant?: SessionTimeStripVariant;
  /**
   * What to pretend the clock is doing. The app never passes this; the dev
   * preview does, because no activity tracker runs there and `unmeasured` is
   * the one state the strip is not worth judging on.
   */
  clock?: ActivityClockState;
}) {
  const { t } = useI18n();
  const activeMs = useActiveDayMs(goal.dayKey, goal.timezone, goal.serverActiveMs, true);
  const measuredClock = useActivityClockState(true);
  const clock = assumedClock ?? measuredClock;
  const shares = goal.phaseShares?.length ? goal.phaseShares : TIME_PHASE_SHARES;
  const kinds = phaseKinds(goal, shares.length);
  const countdown = computeTimeCountdown(activeMs, goal.budgetMs, shares);
  const skin = SKINS[variant];
  // The day being over is its own, already-explained kind of standing still.
  const reason = countdown.finished ? undefined : CLOCK_REASONS[clock];
  const stopped = reason !== undefined;
  // The last minute, and the finish itself, are counted in seconds. Everywhere
  // before that a quiet strip rounds up to whole minutes.
  const seconds = variant === 'loud' || countdown.remainingMs <= TIME_ENDGAME_MS;
  const endgame = seconds && !countdown.finished && variant === 'quiet';
  const muted = countdown.finished || stopped;

  // Full strength on arrival and at every turn of the day, then out of the way.
  const [restedPhase, setRestedPhase] = useState<number | null>(null);
  useEffect(() => {
    const phase = countdown.phase;
    const timer = window.setTimeout(() => setRestedPhase(phase), ATTENTION_MS);
    return () => window.clearTimeout(timer);
  }, [countdown.phase]);
  const rested = restedPhase === countdown.phase;
  const faded = variant === 'quiet' && rested && !stopped && !endgame;

  return (
    <>
      {variant === 'quiet' && !countdown.finished ? (
        <>
          <CurrentTimeRail
            activeMs={activeMs}
            budgetMs={goal.budgetMs}
            shares={shares}
            kinds={kinds}
            phase={countdown.phase}
          />
          <DayTimeRail
            activeMs={activeMs}
            budgetMs={goal.budgetMs}
            shares={shares}
            kinds={kinds}
          />
        </>
      ) : null}
      <div
        data-time-clock
        className={`pointer-events-none flex shrink-0 items-center pb-1 pt-0.5 motion-safe:transition-opacity motion-safe:duration-1000 ${skin.row}`}
        style={{ opacity: faded ? RESTING_OPACITY : 1 }}
      >
        <div
          className={`flex items-center ${skin.frame}`}
          aria-live="off"
          title={reason ? t(reason.hint) : undefined}
        >
          {stopped ? (
            <span
              aria-hidden
              className={`text-[0.6rem] font-black leading-none tracking-[0.08em] text-ink/45${
                // Slow enough to read as breathing rather than as a blinking alarm.
                clock === 'idle' ? ' motion-safe:animate-pulse [animation-duration:3.5s]' : ''
              }`}
            >
              {clock === 'idle' ? 'Zzz' : '❚❚'}
            </span>
          ) : null}
          <span
            className={`leading-none tabular-nums ${skin.digits}`}
            style={{ color: muted ? 'rgba(42, 34, 24, 0.45)' : 'var(--ink)' }}
          >
            {seconds
              ? formatDuration(countdown.remainingMs)
              : t('goal.ofMinutes', { count: Math.ceil(countdown.remainingMs / 60_000) })}
          </span>
          {/* The stopped-clock explanation stays beside the digits. It is not a
              rail label: without it a frozen countdown looks broken, especially
              on touch devices where a tooltip cannot carry the reason. */}
          {reason || variant === 'loud' ? (
            <span className="text-[0.6rem] font-bold leading-none text-ink/45">
              {reason ? t(reason.short) : t('goal.ofMinutes', { count: countdown.minutes })}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
