'use client';

import { useId, type CSSProperties } from 'react';

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
 * weekly target counts days rather than naming them. An empty day still holds
 * its place in the row without implying anything was lost — but it holds it as
 * a dot inside its slot, not as a filled grey disc: seven equal discs gave a
 * lived week the same visual weight as an untouched one, and the run is the
 * thing worth looking at.
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

/**
 * A five-pointed star, point up, centred on (cx, cy).
 *
 * The only mark in the week that is not about attendance: it says a day went
 * past what was asked, which is a different kind of fact than "kept" and so
 * earns a different shape rather than a brighter blue.
 */
function starPath(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  const step = Math.PI / points;
  return Array.from({ length: points * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + i * step;
    const x = cx + radius * Math.cos(angle);
    // Nudged down: a point-up star hangs optically high when centred by box.
    const y = cy + radius * Math.sin(angle) + outer * 0.06;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ') + ' Z';
}

/**
 * How a bead is drawn. The link says what is true about the day; this says
 * which of the six forms carries it, so the switch lives in one place.
 */
type BeadKind = 'kept' | 'partial' | 'open' | 'missed' | 'planned' | 'ahead';

function beadKind(day: StreakDay, link: ChainLink): BeadKind {
  if (link.amount >= 1) return 'kept';
  if (link.amount > 0) return 'partial';
  if (day.isToday) return 'open';
  if (link.ring) return 'planned';
  return day.isFuture ? 'ahead' : 'missed';
}

export function ChainShape({ days, compact = false }: ShapeProps) {
  const uid = useId();
  const r = compact ? 5 : 15;
  const gap = compact ? 4 : 12;
  const pad = compact ? 3 : 7;
  const pitch = r * 2 + gap;
  const width = pad * 2 + days.length * r * 2 + (days.length - 1) * gap;
  const height = pad * 2 + r * 2;
  const cy = height / 2;
  const cx = (index: number) => pad + r + index * pitch;
  const links = days.map(chainLink);

  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Connectors first, so a welded run passes behind its own beads. */}
      {links.map((link, index) => {
        if (index === 0) return null;
        const previous = links[index - 1];
        const welded = link.amount >= 1 && previous.amount >= 1;
        // Welded links run bead-edge to bead-edge with no inset, so the run
        // reads as one cast object; the rest are short, thin and grey.
        const inset = welded ? -1 : compact ? 1.5 : 4;
        return (
          <line
            key={`link-${days[index].dayKey}`}
            x1={cx(index - 1) + r + inset}
            x2={cx(index) - r - inset}
            y1={cy}
            y2={cy}
            stroke={welded ? previous.fill : TRACK}
            strokeWidth={welded ? r * (compact ? 0.6 : 0.42) : compact ? 1.2 : 2.5}
            strokeLinecap="round"
            opacity={welded ? 0.95 : 0.5}
          />
        );
      })}

      {links.map((link, index) => {
        const day = days[index];
        const x = cx(index);
        const kind = beadKind(day, link);
        return (
          <g key={day.dayKey} opacity={link.dim ? 0.7 : 1}>
            {/* Today's halo sits under everything, so it reads as light around
                the bead rather than as another ring drawn on it. */}
            {link.halo ? (
              <circle
                cx={x} cy={cy} r={r + (compact ? 1.6 : 3.5)} fill="none"
                stroke={`color-mix(in srgb, ${link.halo} 22%, transparent)`}
                strokeWidth={compact ? 2 : 4.5}
              />
            ) : null}

            {kind === 'kept' ? (
              <>
                <circle cx={x} cy={cy} r={r} fill={link.fill} />
                {/* Beyond the goal: a star in the bead. The one mark in the
                    week that is not about attendance, so it gets a shape of
                    its own rather than another shade of the same colour. */}
                {link.cap ? (
                  compact
                    ? <circle cx={x} cy={cy} r={r * 0.34} fill="var(--paper)" opacity={0.92} />
                    : <path d={starPath(x, cy, r * 0.62, r * 0.26)} fill="var(--paper)" opacity={0.95} />
                ) : null}
              </>
            ) : null}

            {kind === 'partial' ? (
              <>
                <circle cx={x} cy={cy} r={r} fill={TRACK} />
                <clipPath id={`${uid}-${index}`}>
                  <rect x={x - r} y={cy + r - r * 2 * link.amount} width={r * 2} height={r * 2 * link.amount} />
                </clipPath>
                <circle cx={x} cy={cy} r={r} fill={link.fill} clipPath={`url(#${uid}-${index})`} />
              </>
            ) : null}

            {/* Today, still open: an outline in the kept colour — "you are
                here", not "you failed". */}
            {kind === 'open' ? (
              <circle
                cx={x} cy={cy} r={r - (compact ? 0.6 : 1.5)} fill="none"
                stroke={KEPT} strokeWidth={compact ? 1.4 : 3} opacity={0.85}
              />
            ) : null}

            {/* A day that was planned or had nothing due: the slot, empty. */}
            {kind === 'planned' ? (
              <circle
                cx={x} cy={cy} r={r - (compact ? 0.5 : 1.25)} fill="none"
                stroke={`color-mix(in srgb, ${INK} 20%, transparent)`} strokeWidth={compact ? 1 : 2.5}
              />
            ) : null}

            {/* Blank days are a dot, not a grey disc. Seven equal blobs made a
                good week look the same weight as an empty one; a dot keeps the
                rhythm and lets the run own the eye. */}
            {kind === 'missed' || kind === 'ahead' ? (
              <>
                <circle
                  cx={x} cy={cy} r={r - 0.75} fill="none"
                  stroke={`color-mix(in srgb, ${INK} ${kind === 'missed' ? 10 : 6}%, transparent)`}
                  strokeWidth={compact ? 0.8 : 1.5}
                />
                <circle
                  cx={x} cy={cy} r={r * (compact ? 0.34 : 0.26)}
                  fill={INK} opacity={kind === 'missed' ? 0.2 : 0.12}
                />
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
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
        <span className="absolute text-2xl font-black tabular-nums text-ink-800">{value}</span>
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
