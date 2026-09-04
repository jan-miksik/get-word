'use client';

import { useId, type CSSProperties } from 'react';

import type { StreakDay } from '@/features/learning/goals/streakWeek';
import { INK, KEPT, segmentPaint, TRACK, type SegmentPaint } from './StreakDays';
import { useTodayMarkVariant, type TodayMarkVariant } from './todayMarkVariant';

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
  /**
   * Multiplies the drawn size, 1 by default. Only `ChainShape` reads it —
   * it is the shape real learners see, and the closing card is the one place
   * the series is looked at rather than glanced at, so it is the one place
   * asking to be drawn bigger than its everyday size.
   */
  scale?: number;
  /**
   * Overrides the stored today-mark choice; only `ChainShape` reads it. Lets
   * `/dev/study-goal?view=streak` show every option side by side without each
   * row fighting over the one stored value.
   */
  todayMark?: TodayMarkVariant;
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

/** The today-mark variants drawn as a ring behind the bead, `todayRing` handles all of them. */
const RING_MARKS: readonly TodayMarkVariant[] = ['halo', 'solid', 'pulse', 'ink', 'border', 'crosshair'];

/**
 * The ring drawn behind today's bead, for the variants that use one.
 *
 * `halo` fades the day's own colour to ~22% so it reads as light around the
 * bead — too close to the faint rings already marking a planned-but-undecided
 * day, which is the thing worth fixing. `solid` and `pulse` keep that same
 * colour at much fuller strength instead, so today does not have to be found
 * by spotting the one ring that looks slightly less faint than its
 * neighbours. `pulse` breathes via the `chain-today-pulse` class in
 * `styles/minigames.css` rather than in inline style, so it can be switched
 * off under `prefers-reduced-motion` in one place. `ink` drops the day's own
 * colour entirely and draws the ring in plain ink, so it reads as a neutral
 * UI marker rather than as one more status colour competing with the rest.
 * `border` is the plainest reading of that same idea: a flat 2px line, full
 * opacity, no size difference between compact and full — the literal answer
 * to "just a black border" rather than a softened version of one. `crosshair`
 * draws exactly that same ring and adds the gapped "+" on top of it.
 */
function todayRing(mark: TodayMarkVariant, color: string, compact: boolean) {
  if (mark === 'halo') {
    return { stroke: `color-mix(in srgb, ${color} 22%, transparent)`, className: undefined };
  }
  if (mark === 'ink') {
    return { stroke: INK, strokeOpacity: compact ? 0.6 : 0.72, className: undefined };
  }
  if (mark === 'border' || mark === 'crosshair') {
    return { stroke: INK, strokeOpacity: 1, strokeWidth: 2, className: undefined };
  }
  return {
    stroke: color,
    strokeOpacity: compact ? 0.7 : 0.82,
    className: mark === 'pulse' ? 'chain-today-pulse' : undefined,
  };
}

/** How far out the ring (or, for the reticle marks, the reference radius) sits from the bead's own edge. */
function ringRadius(mark: TodayMarkVariant, r: number, compact: boolean): number {
  if (mark === 'border' || mark === 'crosshair') return r + (compact ? 1 : 3);
  return r + (compact ? 1.6 : 3.5);
}

/**
 * A small downward-pointing marker hung above today's bead, tip nearly
 * touching it — a map pin rather than a ring, so today is found by shape
 * instead of by spotting the one ring that reads slightly different from the
 * others sitting right next to it.
 */
function pinPath(cx: number, tipY: number, size: number): string {
  return `M ${(cx - size).toFixed(2)} ${(tipY - size * 1.7).toFixed(2)} `
    + `L ${(cx + size).toFixed(2)} ${(tipY - size * 1.7).toFixed(2)} `
    + `L ${cx.toFixed(2)} ${tipY.toFixed(2)} Z`;
}

/**
 * A square rotated 45°, its points reaching the same radius a ring would.
 *
 * Every other day in the row is a circle; today alone is not. Breaking the
 * shape language is a stronger claim than any amount of colour or motion —
 * it reads even to someone who has never learned what the colours mean.
 */
function diamondPath(cx: number, cy: number, reach: number): string {
  return `M ${cx.toFixed(2)} ${(cy - reach).toFixed(2)} `
    + `L ${(cx + reach).toFixed(2)} ${cy.toFixed(2)} `
    + `L ${cx.toFixed(2)} ${(cy + reach).toFixed(2)} `
    + `L ${(cx - reach).toFixed(2)} ${cy.toFixed(2)} Z`;
}

/**
 * The four arms of a gapped "+", the way an optical reticle draws one: each
 * arm stops short of the centre so the bead's own fill still shows through,
 * and reaches a little past the ring so it does not just repeat its outline.
 */
function crosshairArms(cx: number, cy: number, innerGap: number, outerReach: number) {
  return [
    { x1: cx, y1: cy - outerReach, x2: cx, y2: cy - innerGap },
    { x1: cx, y1: cy + innerGap, x2: cx, y2: cy + outerReach },
    { x1: cx - outerReach, y1: cy, x2: cx - innerGap, y2: cy },
    { x1: cx + innerGap, y1: cy, x2: cx + outerReach, y2: cy },
  ];
}

/**
 * Short marks spaced evenly around a circle, radiating outward — a compass
 * rose or a radar sweep rather than a continuous line.
 */
function tickMarks(cx: number, cy: number, radius: number, count: number, length: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x1: cx + cos * radius, y1: cy + sin * radius,
      x2: cx + cos * (radius + length), y2: cy + sin * (radius + length),
    };
  });
}

/**
 * Four short L-shaped corners around a square centred on the bead — a
 * camera's autofocus brackets rather than a ring, so today reads as the thing
 * being focused on.
 */
function viewfinderCorners(cx: number, cy: number, half: number, arm: number): string[] {
  const left = cx - half;
  const right = cx + half;
  const top = cy - half;
  const bottom = cy + half;
  return [
    `M ${(left + arm).toFixed(2)} ${top.toFixed(2)} L ${left.toFixed(2)} ${top.toFixed(2)} L ${left.toFixed(2)} ${(top + arm).toFixed(2)}`,
    `M ${(right - arm).toFixed(2)} ${top.toFixed(2)} L ${right.toFixed(2)} ${top.toFixed(2)} L ${right.toFixed(2)} ${(top + arm).toFixed(2)}`,
    `M ${(left + arm).toFixed(2)} ${bottom.toFixed(2)} L ${left.toFixed(2)} ${bottom.toFixed(2)} L ${left.toFixed(2)} ${(bottom - arm).toFixed(2)}`,
    `M ${(right - arm).toFixed(2)} ${bottom.toFixed(2)} L ${right.toFixed(2)} ${bottom.toFixed(2)} L ${right.toFixed(2)} ${(bottom - arm).toFixed(2)}`,
  ];
}

export function ChainShape({ days, compact = false, scale = 1, todayMark: todayMarkProp }: ShapeProps) {
  const uid = useId();
  const storedTodayMark = useTodayMarkVariant();
  const todayMark = todayMarkProp ?? storedTodayMark;
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
    <svg
      aria-hidden
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
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
            {/* Today's ring sits under everything, so it reads as light around
                the bead rather than as another ring drawn on it. Skipped for
                the variants that mark today some other way entirely. */}
            {link.halo && RING_MARKS.includes(todayMark) ? (
              <circle
                cx={x} cy={cy} r={ringRadius(todayMark, r, compact)} fill="none"
                strokeWidth={compact ? 2 : 4.5}
                {...todayRing(todayMark, link.halo, compact)}
              />
            ) : null}

            {kind === 'kept' ? (
              <>
                <circle cx={x} cy={cy} r={r} fill={link.fill} />
                {/* Beyond the goal: a star in the bead, in `--star-gold` — a
                    brighter, colder yellow than the app's own `--amber`, so it
                    reads as a star's own colour rather than as a shade of the
                    app's warm accent. The one mark in the week that is not
                    about attendance, so it gets a shape (and now a colour) of
                    its own rather than another shade of the fill beneath it. */}
                {link.cap ? (
                  compact
                    ? <circle cx={x} cy={cy} r={r * 0.34} fill="var(--star-gold)" opacity={0.95} />
                    : <path d={starPath(x, cy, r * 0.62, r * 0.26)} fill="var(--star-gold)" opacity={0.98} />
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

            {/* `pin`: today marked above the bead rather than around it, so
                the bead itself keeps drawing exactly what it always draws. */}
            {link.halo && todayMark === 'pin' ? (
              <path
                d={pinPath(x, cy - r - (compact ? 1.5 : 3), compact ? 2.4 : 5.5)}
                fill={link.halo}
              />
            ) : null}

            {/* `diamond`: today's outline is a rotated square, not a circle —
                a different silhouette rather than a different shade. */}
            {link.halo && todayMark === 'diamond' ? (
              <path
                d={diamondPath(x, cy, r + (compact ? 2.2 : 5))}
                fill="none"
                stroke={link.halo}
                strokeWidth={compact ? 1.4 : 2.5}
                strokeLinejoin="round"
              />
            ) : null}

            {/* `orbit`: a small satellite circling the bead forever, drawn in
                the day's colour. Its own centre sits away from the bead, so
                the rotation is anchored at the bead itself via `view-box`
                transform coordinates rather than the dot's own bounding box —
                see `.chain-today-orbit` in `styles/minigames.css`. */}
            {link.halo && todayMark === 'orbit' ? (
              <circle
                className="chain-today-orbit"
                cx={x + r + (compact ? 2 : 5)} cy={cy}
                r={compact ? 1 : 2.4}
                fill={link.halo}
                style={{ transformBox: 'view-box', transformOrigin: `${x}px ${cy}px` } as CSSProperties}
              />
            ) : null}

            {/* `crosshair`: the same ring `border` draws, plus a gapped "+"
                on top of it — an optical reticle rather than a plain outline. */}
            {link.halo && todayMark === 'crosshair' ? (
              <g stroke={INK} strokeWidth={compact ? 1 : 1.4} strokeLinecap="round">
                {crosshairArms(
                  x, cy,
                  r * (compact ? 0.5 : 0.4),
                  ringRadius('crosshair', r, compact) + (compact ? 1.5 : 3),
                ).map((arm, i) => <line key={i} {...arm} />)}
              </g>
            ) : null}

            {/* `ticks`: a thin ring plus four short marks radiating from it at
                the cardinal points — a compass rather than a continuous
                outline. */}
            {link.halo && todayMark === 'ticks' ? (
              <g stroke={INK} strokeLinecap="round">
                <circle
                  cx={x} cy={cy} r={r + (compact ? 1 : 3)} fill="none"
                  strokeWidth={compact ? 1 : 1.4} opacity={0.55}
                />
                {tickMarks(x, cy, r + (compact ? 1 : 3), 4, compact ? 2 : 4).map((tick, i) => (
                  <line key={i} {...tick} strokeWidth={compact ? 1.2 : 1.8} />
                ))}
              </g>
            ) : null}

            {/* `target`: two concentric rings instead of one — a bullseye
                rather than a single outline. */}
            {link.halo && todayMark === 'target' ? (
              <g stroke={INK} fill="none">
                <circle cx={x} cy={cy} r={r + (compact ? 1 : 2.5)} strokeWidth={compact ? 1 : 1.6} opacity={0.85} />
                <circle cx={x} cy={cy} r={r + (compact ? 3 : 6.5)} strokeWidth={compact ? 0.8 : 1.2} opacity={0.4} />
              </g>
            ) : null}

            {/* `viewfinder`: four autofocus-style corner brackets instead of a
                ring, as though the bead were the subject a camera is
                focusing on. */}
            {link.halo && todayMark === 'viewfinder' ? (
              <g
                className="chain-today-viewfinder"
                stroke={INK}
                strokeWidth={compact ? 1.2 : 2}
                strokeLinecap="round"
                fill="none"
              >
                {viewfinderCorners(
                  x, cy,
                  r + (compact ? 1 : 2),
                  (r + (compact ? 1 : 2)) * 0.4,
                ).map((d, i) => <path key={i} d={d} />)}
              </g>
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
