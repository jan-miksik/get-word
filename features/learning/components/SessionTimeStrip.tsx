'use client';

import { useI18n } from '@/components/I18nProvider';
import type { I18nKey } from '@/lib/i18n/messages';
import type { ActivityClockState } from '@/lib/activity/runtime';
import { formatDuration } from '@/features/learning/goals/useStudyCountdown';
import {
  useActiveDayMs,
  useActivityClockState,
} from '@/features/learning/goals/useActiveDayMs';
import {
  TIME_PHASE_BOUNDARIES,
  computeTimeCountdown,
} from '@/features/learning/session/timeCountdown';

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
}

/**
 * Why the digits are standing still, in the two lengths the strip needs: a
 * couple of words that fit in the pill, and the sentence behind them.
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

/**
 * The clock of a minutes day, and the only thing that measures it.
 *
 * A minutes goal used to be drawn as two hairline rails at the edges of the
 * study surface, the same frame a words day uses for its cards. That was one
 * picture too many: the rails answered the same question as the number they
 * stood beside, and the number itself sat in the card's own top-right corner,
 * on top of the stage badge. So the rails are gone and the countdown got its
 * own strip above the deck, where nothing can collide with it.
 *
 * The bar beneath the digits is the counterpart of the falling number: it fills
 * as the budget is spent, and the two hairlines across it are where the day
 * changes what it is doing — repeats, new words, then the closing stretch (see
 * `planTimeSessionBlocks`). The learner never has to read the phases; they just
 * make the bar's movement mean something more than "later".
 *
 * Standing still is a state the strip has to be able to explain. There are four
 * ways a countdown stops without the day being over, and a clock that freezes
 * mutely is indistinguishable from a broken one — so whenever the digits are
 * not moving, the pill swaps the "of 15 min" suffix for the reason. In words,
 * not a tooltip: a title attribute is nothing at all on a phone, which is where
 * this is read.
 */
export function SessionTimeStrip({ goal }: { goal: SessionTimeGoal }) {
  const { t } = useI18n();
  const activeMs = useActiveDayMs(goal.dayKey, goal.timezone, goal.serverActiveMs, true);
  const clock = useActivityClockState(true);
  const countdown = computeTimeCountdown(activeMs, goal.budgetMs);
  const spentPercent = (1 - countdown.remainingFraction) * 100;
  // The day being over is its own, already-explained kind of standing still.
  const reason = countdown.finished ? undefined : CLOCK_REASONS[clock];
  const stopped = reason !== undefined;
  // The ink is fixed rather than themed: the study area sits on the app's own
  // warm sand ground in every theme, so a light-theme token would wash out.
  const color = countdown.finished || stopped ? 'rgba(42, 34, 24, 0.35)' : 'var(--rail-day)';

  return (
    <div className="pointer-events-none flex shrink-0 items-center justify-center px-3 pb-1 pt-0.5">
      <div
        className="flex items-center gap-2 rounded-full border border-[#2A2218]/10 bg-[#FFF8E8]/60 px-3 py-1 shadow-[0_2px_10px_rgba(42,34,24,0.07)]"
        aria-live="off"
        title={reason ? t(reason.hint) : undefined}
      >
        {stopped ? (
          <span
            aria-hidden
            className={`text-[0.6rem] font-black leading-none tracking-[0.08em] text-[#2A2218]/45${
              clock === 'idle' ? ' motion-safe:animate-pulse' : ''
            }`}
          >
            {clock === 'idle' ? 'Zzz' : '❚❚'}
          </span>
        ) : null}
        <span
          className="text-[0.95rem] font-black leading-none tabular-nums"
          style={{ color: countdown.finished || stopped ? 'rgba(42, 34, 24, 0.45)' : '#2a2218' }}
        >
          {formatDuration(countdown.remainingMs)}
        </span>
        <span className="text-[0.6rem] font-bold leading-none text-[#2A2218]/45">
          {reason ? t(reason.short) : t('goal.ofMinutes', { count: countdown.minutes })}
        </span>
        <span
          aria-hidden
          className="relative h-[3px] w-16 overflow-hidden rounded-full"
          style={{ background: 'var(--rail-track)' }}
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-linear"
            style={{ width: `${spentPercent}%`, background: color }}
          />
          {TIME_PHASE_BOUNDARIES.map((boundary) => (
            <span
              key={boundary}
              className="absolute inset-y-0 w-px"
              style={{ left: `${boundary * 100}%`, background: 'rgba(255, 248, 232, 0.85)' }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
