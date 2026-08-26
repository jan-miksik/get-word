'use client';

import type { CSSProperties } from 'react';

import type { StreakDay } from '@/features/learning/goals/streakWeek';
import { INK, KEPT, segmentPaint, TRACK, type SegmentPaint } from './StreakDays';

/**
 * The alternative shapes the study series can take.
 *
 * All of them read the same `segmentPaint` semantics — how full the day was,
 * which colour it earned, whether it is today — so the meaning is fixed and
 * only the form changes. That is what makes them comparable side by side on
 * `/dev/study-goal?view=streak`: a choice about feel, not about what is true.
 */

export interface ShapeProps {
  days: StreakDay[];
  weeks?: StreakDay[][];
  compact?: boolean;
  /** The number the shape may fold in, where it has room for it. */
  value?: number;
}

function kept(paint: SegmentPaint): boolean {
  return paint.fill >= 1;
}

/**
 * Every day is a link; kept days are welded to their neighbours.
 *
 * The most literal reading of "series" — the eye follows an unbroken run and
 * stops exactly where the run stopped, without needing the number at all.
 *
 * No day is ever a gap. Leaving days off the preferred weekdays blank made the
 * week look broken in a way it was not: those days were never owed, and the
 * weekly target counts days rather than naming them. A grey link says "nothing
 * happened here" without implying anything was lost.
 */
export interface ChainLink {
  /** Colour of the filled portion; grey when the day is unfilled. */
  fill: string;
  /** How much of the link is cast, 0–1. */
  amount: number;
  ring: boolean;
  halo?: string;
  cap: boolean;
  /** Dimmed rather than absent — days still ahead have not failed. */
  dim: boolean;
}

export function chainLink(day: StreakDay): ChainLink {
  const paint = segmentPaint(day);
  return {
    fill: paint.fill > 0 ? paint.color : TRACK,
    amount: paint.fill,
    // A day still ahead keeps its outline so the intended rhythm stays legible.
    ring: paint.ring,
    halo: paint.halo,
    cap: paint.cap,
    dim: day.isFuture,
  };
}

export function ChainShape({ days, compact = false }: ShapeProps) {
  const size = compact ? 10 : 30;
  const linkW = compact ? 4 : 12;
  const linkH = compact ? 2 : 4;

  return (
    <span aria-hidden className="inline-flex items-center">
      {days.map((day, index) => {
        const link = chainLink(day);
        const welded = link.amount >= 1 && index > 0 && chainLink(days[index - 1]).amount >= 1;
        return (
          <span key={day.dayKey} className="relative inline-flex items-center">
            {index > 0 ? (
              <span
                className="block"
                style={{
                  width: linkW,
                  height: linkH,
                  borderRadius: 999,
                  // Welded links take the colour of the run; the rest stay grey
                  // so an unbroken stretch is visible from across the room.
                  background: welded ? KEPT : TRACK,
                  opacity: welded ? 0.95 : 0.55,
                }}
              />
            ) : null}
            <span
              className="relative block shrink-0 rounded-full motion-safe:transition-[background] motion-safe:duration-300"
              style={{
                width: size,
                height: size,
                opacity: link.dim ? 0.5 : 1,
                background: link.amount > 0 && link.amount < 1
                  ? `linear-gradient(to top, ${link.fill} ${link.amount * 100}%, ${TRACK} ${link.amount * 100}%)`
                  : link.fill,
                boxShadow: [
                  link.ring ? `inset 0 0 0 ${compact ? 1.5 : 2.5}px color-mix(in srgb, ${INK} 22%, transparent)` : '',
                  link.halo ? `0 0 0 ${compact ? 2 : 5}px color-mix(in srgb, ${link.halo} 22%, transparent)` : '',
                ].filter(Boolean).join(', ') || undefined,
              }}
            >
              {link.cap ? (
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ boxShadow: `inset 0 0 0 ${compact ? 1.5 : 3}px color-mix(in srgb, ${INK} 42%, transparent)` }}
                />
              ) : null}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * The week bent into a circle with the count inside it.
 *
 * Compact and emblem-like — it reads as one object rather than a row of data,
 * which is what suits a number meant to be looked forward to.
 */
export function RingShape({ days, compact = false, value }: ShapeProps) {
  const size = compact ? 22 : 92;
  const stroke = compact ? 3 : 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = compact ? 0.14 : 0.1;
  const arc = circumference / 7;

  return (
    <span aria-hidden className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {days.map((day, index) => {
          const paint = segmentPaint(day);
          const visible = arc * (1 - gap);
          const base = paint.track || paint.ring ? TRACK : 'transparent';
          return (
            <g key={day.dayKey}>
              <circle
                cx={size / 2} cy={size / 2} r={radius} fill="none"
                stroke={base} strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={`${visible} ${circumference - visible}`}
                strokeDashoffset={-arc * index}
              />
              {paint.fill > 0 ? (
                <circle
                  cx={size / 2} cy={size / 2} r={radius} fill="none"
                  stroke={paint.color} strokeWidth={stroke} strokeLinecap="round"
                  strokeDasharray={`${visible * paint.fill} ${circumference - visible * paint.fill}`}
                  strokeDashoffset={-arc * index}
                />
              ) : null}
              {paint.cap ? (
                <circle
                  cx={size / 2} cy={size / 2} r={radius} fill="none"
                  stroke={INK} strokeWidth={stroke} strokeLinecap="butt" opacity={0.4}
                  strokeDasharray={`${visible * 0.22} ${circumference - visible * 0.22}`}
                  strokeDashoffset={-arc * index - visible * 0.78}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      {!compact && value !== undefined ? (
        <span className="absolute text-2xl font-black tabular-nums text-[#1f1a12]">{value}</span>
      ) : null}
    </span>
  );
}

/**
 * Six weeks instead of one.
 *
 * The single week is honest but short-sighted: someone forty days in sees the
 * same picture as someone four days in. This trades the day-by-day detail for
 * the shape of a habit — which is the thing actually worth looking at once the
 * series stops being news.
 */
export function TrailShape({ days, weeks, compact = false }: ShapeProps) {
  const rows = weeks ?? [days];
  const cell = compact ? 3 : 9;
  const gap = compact ? 1 : 3;
  return (
    <span aria-hidden className="inline-flex flex-col" style={{ gap }}>
      {rows.map((week, weekIndex) => (
        <span key={weekIndex} className="inline-flex" style={{ gap }}>
          {week.map((day) => {
            const paint = segmentPaint(day);
            return (
              <span
                key={day.dayKey}
                className="block"
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: compact ? 1 : 2.5,
                  background: paint.fill > 0
                    ? paint.color
                    : paint.track
                      ? TRACK
                      : 'transparent',
                  opacity: paint.fill > 0 && paint.fill < 1 ? 0.55 : 1,
                  boxShadow: [
                    paint.ring ? `inset 0 0 0 1px color-mix(in srgb, ${INK} 20%, transparent)` : '',
                    paint.halo ? `0 0 0 ${compact ? 1 : 2}px color-mix(in srgb, ${paint.halo} 30%, transparent)` : '',
                    paint.cap ? `inset 0 ${compact ? 1 : 2}px 0 color-mix(in srgb, ${INK} 40%, transparent)` : '',
                  ].filter(Boolean).join(', ') || undefined,
                }}
              />
            );
          })}
        </span>
      ))}
    </span>
  );
}

/**
 * A run that climbs.
 *
 * Every kept day starts higher than the last, so an unbroken series turns into
 * ground gained and a break drops back to the floor. The only variant where the
 * length of the run is felt rather than counted.
 */
export function StepsShape({ days, compact = false }: ShapeProps) {
  const unit = compact ? 2 : 5;
  const base = compact ? 4 : 10;
  const width = compact ? 3 : 10;

  // Folded rather than accumulated in a mutable local: the height of each step
  // depends only on the days before it, so it is a scan, not state.
  const heights = days.reduce<Array<{ paint: SegmentPaint; climb: number }>>((acc, day) => {
    const paint = segmentPaint(day);
    const previous = acc.at(-1)?.climb ?? 0;
    const climb = kept(paint)
      ? previous + 1
      // Only a lived, blank day drops back to the floor — a day still ahead or
      // one with nothing due leaves the run where it was.
      : paint.fill === 0 && !day.isFuture && !paint.ring
        ? 0
        : previous;
    return [...acc, { paint, climb }];
  }, []);

  return (
    <span aria-hidden className="inline-flex items-end" style={{ gap: compact ? 2 : 4 }}>
      {heights.map(({ paint, climb: step }, index) => {
        const day = days[index];
        const height = base + step * unit;
        const style: CSSProperties = {
          width,
          height: paint.fill > 0 ? height : base,
          borderRadius: 999,
          background: paint.fill > 0
            ? paint.color
            : paint.track ? TRACK : 'transparent',
          boxShadow: [
            paint.ring ? `inset 0 0 0 1.5px color-mix(in srgb, ${INK} 22%, transparent)` : '',
            paint.halo ? `0 0 0 ${compact ? 2 : 3}px color-mix(in srgb, ${paint.halo} 22%, transparent)` : '',
            paint.cap ? `inset 0 ${compact ? 2 : 3}px 0 color-mix(in srgb, ${INK} 45%, transparent)` : '',
          ].filter(Boolean).join(', ') || undefined,
        };
        if (paint.fill > 0 && paint.fill < 1) {
          style.background = `linear-gradient(to top, ${paint.color} ${paint.fill * 100}%, ${TRACK} ${paint.fill * 100}%)`;
        }
        return <span key={day.dayKey} className="block motion-safe:transition-[height] motion-safe:duration-300" style={style} />;
      })}
    </span>
  );
}
