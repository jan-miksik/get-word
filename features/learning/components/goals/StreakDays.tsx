'use client';

import { useI18n } from '@/components/I18nProvider';
import type { I18nKey } from '@/lib/i18n/messages';
import type { StreakChipData, StreakDay } from '@/features/learning/goals/streakWeek';
import { ChainShape, RingShape, StepsShape, TrailShape, type ShapeProps } from './StreakShapes';
import { CometShape, PulseShape, StackShape, WaveShape } from './StreakShapesAlt';
import { useStreakVariant, type StreakVariant } from './streakVariant';

const SHAPES: Record<Exclude<StreakVariant, 'bars'>, (props: ShapeProps) => React.ReactNode> = {
  chain: ChainShape,
  ring: RingShape,
  trail: TrailShape,
  steps: StepsShape,
  wave: WaveShape,
  pulse: PulseShape,
  comet: CometShape,
  stack: StackShape,
};

/**
 * One week of the study series, drawn in the language of the session rails.
 *
 * Not a flame. A streak icon says "you have a number"; seven segments say what
 * the number is made of — which days the plan asked for, which ones were kept,
 * and where today sits. That matters here more than in most apps because the
 * series counts study opportunities rather than calendar days, so the picture
 * is what makes the number legible.
 *
 * Deliberately knows nothing about goals. It takes seven days and draws them;
 * whether a goal exists at all is the caller's question, and the number lives
 * in `StreakSummary` or in the chip, never in here — so it can never be drawn
 * twice in the same place.
 */

const WEEKDAY_KEYS: I18nKey[] = [
  'goal.weekdayMon',
  'goal.weekdayTue',
  'goal.weekdayWed',
  'goal.weekdayThu',
  'goal.weekdayFri',
  'goal.weekdaySat',
  'goal.weekdaySun',
];

export const KEPT = 'var(--rail-review)';
/** The second rail colour: a day taken beyond the plan reads as extra, not as routine. */
const BONUS = 'var(--rail-new)';
export const TRACK = 'var(--rail-track)';
/** The bar's own ink, for outlines that must survive a near-transparent track. */
export const INK = '#2a2218';

/**
 * Days are told apart by shape, not by shades of one colour.
 *
 * `--rail-track` is itself only ~13% opaque, so a "slightly fainter track" for
 * a day still ahead lands near 7% and simply vanishes on the warm background —
 * and the rhythm of a 4/7 goal vanishes with it. So: a solid fill means the day
 * is settled (colour = kept, grey = missed), a ring means the day is planned
 * but not yet decided, and nothing at all means the plan never asked for it.
 */
/**
 * Days are told apart by fill *height* and by shape, not by shades of one colour.
 *
 * `--rail-track` is itself only ~13% opaque, so a "slightly fainter track" for a
 * day still ahead lands near 7% and simply vanishes on the warm background. The
 * scale instead reads bottom-up like a tiny bar: a partial day is filled part of
 * the way, a met day fully, and an exceeded day fully plus a cap above it. That
 * keeps "did something" visibly different from "did nothing" without letting it
 * pass for a day that was earned.
 */
export interface SegmentPaint {
  /** Draw the grey lane behind the fill, so a short fill shows what was missed. */
  track: boolean;
  /** Height of the filled part, 0–1 of the segment. */
  fill: number;
  color: string;
  /** An outline instead of a lane: planned or pending, not yet decided. */
  ring: boolean;
  halo?: string;
  /** The extra mark an exceeded day carries above a full fill. */
  cap: boolean;
}

export function segmentPaint(day: StreakDay): SegmentPaint {
  const base: SegmentPaint = { track: false, fill: 0, color: KEPT, ring: false, cap: false };

  if (day.status === 'exceeded' || day.status === 'met') {
    // A day taken outside the preferred weekdays still counts in full; the
    // second rail colour only notes that it fell outside the intended shape.
    const color = day.preferred === false ? BONUS : KEPT;
    return {
      ...base,
      track: true,
      fill: 1,
      color,
      cap: day.status === 'exceeded',
      ...(day.isToday ? { halo: color } : {}),
    };
  }

  if (day.status === 'partial') {
    // Short of full against a visible lane, so the gap is the message: the
    // learner was here, and the goal still was not met.
    return { ...base, track: true, fill: 0.45, ...(day.isToday ? { halo: KEPT } : {}) };
  }

  // Nothing was due, so there was nothing to keep. Never a failure, so it gets
  // no lane to fall short of.
  if (day.status === 'nothing_due') return { ...base, ring: true };

  // Today, still open: "you are here" rather than "you failed".
  if (day.isToday) return { ...base, track: true, halo: KEPT };
  // A preferred day still ahead: an empty slot, so the intended rhythm reads at
  // a glance even before the week has been lived.
  if (day.isFuture) return { ...base, ring: day.preferred === true };
  // A blank past day. Preferred or not, it is the same miss — the weekly target
  // counts days, so a specific weekday was never owed.
  return { ...base, track: true };
}

export function StreakDays({
  days,
  weeks,
  size = 'full',
  variant,
  value,
}: {
  days: StreakDay[];
  weeks?: StreakDay[][];
  size?: 'compact' | 'full';
  /** Overrides the stored choice; the picker on `/dev/study-goal` passes it. */
  variant?: StreakVariant;
  /** Folded into the shape where one has room for it (the ring). */
  value?: number;
}) {
  const { t } = useI18n();
  const compact = size === 'compact';
  const stored = useStreakVariant();
  const shape = variant ?? stored;

  if (shape !== 'bars') {
    const Shape = SHAPES[shape];
    return <Shape days={days} weeks={weeks} compact={compact} value={value} />;
  }

  return (
    <span
      aria-hidden
      className={compact ? 'inline-flex items-end gap-[2px]' : 'flex items-end justify-center gap-1.5'}
    >
      {days.map((day) => {
        const paint = segmentPaint(day);
        return (
          <span key={day.dayKey} className={compact ? 'block' : 'flex flex-col items-center gap-1'}>
            <span
              className={`relative block overflow-hidden rounded-full ${compact ? 'h-3 w-[3px]' : 'h-9 w-4 sm:h-11 sm:w-5'}`}
              style={{
                background: paint.track ? TRACK : 'transparent',
                boxShadow: [
                  paint.ring ? `inset 0 0 0 1.5px color-mix(in srgb, ${INK} 22%, transparent)` : '',
                  paint.halo ? `0 0 0 ${compact ? 2 : 3}px color-mix(in srgb, ${paint.halo} 20%, transparent)` : '',
                ].filter(Boolean).join(', ') || undefined,
              }}
            >
              {paint.fill > 0 ? (
                <span
                  className="absolute inset-x-0 bottom-0 block rounded-full motion-safe:transition-[height] motion-safe:duration-300"
                  style={{ height: `${paint.fill * 100}%`, background: paint.color }}
                />
              ) : null}
              {/* The cap sits above a full fill, so "went further" is a mark the
                  eye catches without another colour entering the scale. */}
              {paint.cap ? (
                <span
                  className="absolute inset-x-0 top-0 block"
                  style={{ height: compact ? '2px' : '3px', background: INK, opacity: 0.55 }}
                />
              ) : null}
            </span>
            {compact ? null : (
              <span className="text-[0.6875rem] font-bold leading-none text-text-soft sm:text-xs">
                {t(WEEKDAY_KEYS[day.weekday - 1])}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Both numbers and the week, for the end-of-day card.
 *
 * Two streaks because they answer different questions. The weekly one is the
 * promise the learner actually made — four days, any four — and it is the one
 * that survives an ordinary life. The daily one is strict and therefore worth
 * something when it is long. Showing only the strict number would punish a
 * kept goal; showing only the forgiving one would make a 40-day run invisible.
 *
 * The labels carry no unit. "3 days in a row" would be wrong for the weekly
 * figure and misleading for a plan kept on different days than intended, so the
 * counts stand alone and the seven segments say what was counted.
 */
export function StreakSummary({ streak }: { streak: StreakChipData }) {
  const { t } = useI18n();
  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      <div className="flex items-baseline justify-center gap-5">
        {streak.dailyStreak === 0 && streak.weeklyStreak === 0 ? (
          <p className="m-0 text-base font-black tabular-nums text-[#4a4032] sm:text-lg">
            {t('goal.streakLabel', { count: streak.dailyStreak })}
          </p>
        ) : null}
        {streak.dailyStreak > 0 ? (
          <p className="m-0 text-base font-black tabular-nums text-[#4a4032] sm:text-lg">
            {t('goal.streakLabel', { count: streak.dailyStreak })}
          </p>
        ) : null}
        {streak.weeklyStreak > 0 ? (
          <p className="m-0 text-base font-black tabular-nums text-[#4a4032] sm:text-lg">
            {t('goal.streakWeeksLabel', { count: streak.weeklyStreak })}
          </p>
        ) : null}
      </div>
      <StreakDays days={streak.days} weeks={streak.weeks} size="full" value={streak.dailyStreak} />
      {streak.weekTarget > 0 ? (
        <p className="m-0 text-sm font-semibold tabular-nums text-[#6b5b45]">
          {t('goal.streakWeekProgress', { count: streak.keptThisWeek, target: streak.weekTarget })}
        </p>
      ) : null}
    </div>
  );
}
