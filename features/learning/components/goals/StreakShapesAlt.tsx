'use client';

import type { StreakDay } from '@/features/learning/goals/streakWeek';
import { INK, KEPT, segmentPaint, TRACK } from './StreakDays';
import type { ShapeProps } from './StreakShapes';

/**
 * A second set of shapes, drawn without deference to the session-rail language.
 *
 * The rail vocabulary is right for something glanced at mid-study, but this
 * number is looked *at* — it is the reward at the end of the day — and the
 * house style was quietly capping how interesting it was allowed to be. These
 * four start from the idea instead: a week has a shape, effort has a profile,
 * a run has direction.
 *
 * They still read the same `segmentPaint` semantics, so nothing here can claim
 * something the bars would not.
 */

const CURVE_TENSION = 0.42;

/** A Catmull-Rom-ish smoothing so the profile reads as one gesture, not seven. */
function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return '';
  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + ((p2.x - p0.x) / 6) * CURVE_TENSION * 3;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * CURVE_TENSION * 3;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * CURVE_TENSION * 3;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * CURVE_TENSION * 3;
    parts.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`);
  }
  return parts.join(' ');
}

/**
 * The week as one continuous profile, with the area under it filled.
 *
 * Seven separate marks make the eye count; a single line makes it read. Effort
 * becomes a landscape — where the week dipped, where it held — and a partial
 * day is a dip rather than a smaller object of a different kind.
 */
export function WaveShape({ days, compact = false }: ShapeProps) {
  const w = compact ? 26 : 168;
  const h = compact ? 12 : 56;
  const pad = compact ? 1.5 : 6;
  const step = (w - pad * 2) / 6;

  const all = days.map((day, index) => {
    const paint = segmentPaint(day);
    return { x: pad + step * index, y: h - pad - (h - pad * 2) * paint.fill, paint, day };
  });
  // The trace stops at today. Drawing days that have not happened yet as zero
  // makes an untouched rest-of-week look like a collapse rather than a blank.
  const livedCount = Math.max(2, all.filter((entry) => !entry.day.isFuture).length);
  const points = all.slice(0, livedCount);
  const ahead = all.slice(livedCount - 1);
  const line = smoothPath(points);
  const area = `${line} L ${points.at(-1)!.x} ${h} L ${points[0].x} ${h} Z`;

  return (
    <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={`wave-${compact ? 'c' : 'f'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={KEPT} stopOpacity="0.42" />
          <stop offset="100%" stopColor={KEPT} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke={TRACK} strokeWidth={compact ? 1 : 2} strokeLinecap="round" />
      <path d={area} fill={`url(#wave-${compact ? 'c' : 'f'})`} />
      <path d={line} fill="none" stroke={KEPT} strokeWidth={compact ? 1.4 : 2.6} strokeLinecap="round" strokeLinejoin="round" />
      {ahead.length > 1 ? (
        <path
          d={`M ${ahead[0].x} ${h - pad} L ${ahead.at(-1)!.x} ${h - pad}`}
          fill="none" stroke={KEPT} strokeWidth={compact ? 1.2 : 2}
          strokeLinecap="round" strokeDasharray={compact ? '1 2' : '2 5'} opacity={0.32}
        />
      ) : null}
      {points.map(({ x, y, paint, day }) => {
        if (paint.fill === 0 && !day.isToday) return null;
        return (
          <circle
            key={day.dayKey}
            cx={x} cy={y}
            r={day.isToday ? (compact ? 2.2 : 5) : (compact ? 1.3 : 3)}
            fill={paint.fill > 0 ? paint.color : '#fffaf0'}
            stroke={day.isToday ? paint.color : 'transparent'}
            strokeWidth={compact ? 1 : 2}
          />
        );
      })}
    </svg>
  );
}

/**
 * A heartbeat: the week as a trace on a monitor.
 *
 * A kept day spikes, a partial day twitches, a blank day flatlines. It carries
 * the same numbers as the bars but says something the bars cannot — that this
 * is something alive, and that a flat stretch is the absence of a pulse rather
 * than merely a lower value.
 */
export function PulseShape({ days, compact = false }: ShapeProps) {
  const w = compact ? 28 : 190;
  const h = compact ? 12 : 54;
  const mid = h / 2;
  const step = w / 7;

  // As with the wave: a week that has not been lived yet is not a flatline.
  const livedCount = Math.max(1, days.filter((day) => !day.isFuture).length);
  const lived = days.slice(0, livedCount);
  const segments = lived.map((day, index) => {
    const paint = segmentPaint(day);
    const x = step * index;
    const amp = (h / 2 - (compact ? 1 : 4)) * paint.fill;
    if (paint.fill === 0) return `L ${x + step} ${mid}`;
    // Down-up-down: the classic QRS shape, scaled by how full the day was.
    return [
      `L ${x + step * 0.2} ${mid}`,
      `L ${x + step * 0.32} ${mid + amp * 0.3}`,
      `L ${x + step * 0.5} ${mid - amp}`,
      `L ${x + step * 0.66} ${mid + amp * 0.45}`,
      `L ${x + step * 0.8} ${mid}`,
      `L ${x + step} ${mid}`,
    ].join(' ');
  });

  const todayIndex = days.findIndex((day) => day.isToday);

  return (
    <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <path
        d={`M 0 ${mid} ${segments.join(' ')}`}
        fill="none"
        stroke={KEPT}
        strokeWidth={compact ? 1.3 : 2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {livedCount < 7 ? (
        <path
          d={`M ${step * livedCount} ${mid} L ${w} ${mid}`}
          fill="none" stroke={KEPT} strokeWidth={compact ? 1.2 : 2}
          strokeLinecap="round" strokeDasharray={compact ? '1 2' : '2 5'} opacity={0.3}
        />
      ) : null}
      {lived.map((day, index) => {
        const paint = segmentPaint(day);
        if (paint.color === KEPT || paint.fill === 0) return null;
        // Bonus days keep their own colour by overdrawing just their beat.
        const x = step * index;
        const amp = (h / 2 - (compact ? 1 : 4)) * paint.fill;
        return (
          <path
            key={day.dayKey}
            d={`M ${x + step * 0.2} ${mid} L ${x + step * 0.32} ${mid + amp * 0.3} L ${x + step * 0.5} ${mid - amp} L ${x + step * 0.66} ${mid + amp * 0.45} L ${x + step * 0.8} ${mid}`}
            fill="none" stroke={paint.color} strokeWidth={compact ? 1.3 : 2.4}
            strokeLinecap="round" strokeLinejoin="round"
          />
        );
      })}
      {todayIndex >= 0 ? (
        <circle
          cx={step * todayIndex + step * 0.5}
          cy={mid - (h / 2 - (compact ? 1 : 4)) * segmentPaint(days[todayIndex]).fill}
          r={compact ? 1.8 : 4}
          fill={segmentPaint(days[todayIndex]).color}
        />
      ) : null}
    </svg>
  );
}

/**
 * The run as a comet: today is the head, the days behind it are the tail.
 *
 * Every other shape lays the week out as equals. This one has a direction and a
 * present moment — the streak is something moving, and the past fades rather
 * than being tallied. Length of tail *is* the number.
 */
export function CometShape({ days, compact = false }: ShapeProps) {
  const size = compact ? 12 : 44;
  const w = compact ? 30 : 200;
  const cx = w - (compact ? 5 : 22);

  // Count back from today through the days that were kept — that run is the tail.
  const todayIndex = days.findIndex((day) => day.isToday);
  const anchor = todayIndex >= 0 ? todayIndex : days.length - 1;
  const tail: Array<{ day: StreakDay; distance: number }> = [];
  for (let index = anchor, distance = 0; index >= 0; index -= 1) {
    const paint = segmentPaint(days[index]);
    if (paint.fill === 0 && index !== anchor) break;
    tail.push({ day: days[index], distance });
    distance += 1;
  }

  const headPaint = segmentPaint(days[anchor] ?? days[0]);
  const spacing = compact ? 5 : 26;

  return (
    <svg aria-hidden width={w} height={size} viewBox={`0 0 ${w} ${size}`} className="overflow-visible">
      {tail.slice().reverse().map(({ day, distance }) => {
        const paint = segmentPaint(day);
        const x = cx - distance * spacing;
        if (x < 0) return null;
        const fade = Math.max(0.12, 1 - distance * 0.22);
        const r = (compact ? 3 : 11) * Math.max(0.35, 1 - distance * 0.16);
        return (
          <circle
            key={day.dayKey}
            cx={x} cy={size / 2} r={r}
            fill={paint.color}
            opacity={distance === 0 ? 1 : fade * (paint.fill > 0 ? 1 : 0.35)}
          />
        );
      })}
      {/* The head carries the halo, so "now" is unmistakable. */}
      <circle
        cx={cx} cy={size / 2} r={compact ? 4 : 14}
        fill="none"
        stroke={headPaint.color}
        strokeWidth={compact ? 1 : 2.5}
        opacity={0.35}
      />
      {headPaint.cap ? (
        <circle cx={cx} cy={size / 2} r={compact ? 1.4 : 4} fill={INK} opacity={0.5} />
      ) : null}
    </svg>
  );
}

/**
 * Kept days stack into a tower; the week's misses lie flat beneath it.
 *
 * The only shape where the streak has mass. Seven marks in a row are a record;
 * a stack is an achievement, and it gets taller in a way a row never does.
 */
export function StackShape({ days, compact = false }: ShapeProps) {
  const blockW = compact ? 10 : 46;
  const blockH = compact ? 2.5 : 11;
  const gap = compact ? 1 : 3;
  const keptDays = days.filter((day) => segmentPaint(day).fill >= 1);
  const partials = days.filter((day) => {
    const paint = segmentPaint(day);
    return paint.fill > 0 && paint.fill < 1;
  });

  return (
    <span aria-hidden className="inline-flex flex-col items-center" style={{ gap }}>
      {keptDays.slice().reverse().map((day, index) => {
        const paint = segmentPaint(day);
        return (
          <span
            key={day.dayKey}
            className="block motion-safe:transition-transform"
            style={{
              width: blockW - index * (compact ? 0.6 : 2),
              height: blockH,
              borderRadius: compact ? 1.5 : 3,
              background: paint.color,
              boxShadow: paint.halo
                ? `0 0 0 ${compact ? 1.5 : 3}px color-mix(in srgb, ${paint.halo} 22%, transparent)`
                : paint.cap
                  ? `inset 0 ${compact ? 1 : 2}px 0 color-mix(in srgb, ${INK} 40%, transparent)`
                  : undefined,
            }}
          />
        );
      })}
      {partials.map((day) => (
        <span
          key={day.dayKey}
          className="block"
          style={{
            width: (blockW * segmentPaint(day).fill),
            height: blockH,
            borderRadius: compact ? 1.5 : 3,
            background: segmentPaint(day).color,
            opacity: 0.6,
          }}
        />
      ))}
      {/* The ground the tower stands on, so an empty week is still a picture. */}
      <span
        className="block"
        style={{ width: blockW + (compact ? 2 : 8), height: compact ? 1.5 : 4, borderRadius: 999, background: TRACK }}
      />
    </span>
  );
}
