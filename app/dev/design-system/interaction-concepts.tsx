'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

/**
 * Round two of the button concepts, ported onto the app's own paper.
 *
 * The personalities in the section above ask one question — what *shape* is a
 * button here. These ask a different one: what does a control that only this
 * app could have actually *do*. Every concept below is a real behaviour the app
 * already owns (reveal, audio, study direction, undo, scratch, the eleven-stage
 * ladder, memory hooks, matching) drawn as the single gesture it wants to be.
 *
 * Concepts 4–7 are the imported round-two sketches, re-skinned; 8–12 are the
 * new ones. Nothing here is wired into the app — it paints from the same
 * `--ds-*` variables as the rest of the page, so the palette editor in section
 * 1 drives all of it.
 */

/* ---------------------------------------------------------------- shell -- */

function Concept({
  n,
  kicker,
  title,
  note,
  children,
}: {
  n: number;
  kicker: string;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'var(--ds-paper)',
        boxShadow: 'inset 0 0 0 1px var(--ds-paper-edge)',
      }}
    >
      <p
        className="text-[0.72rem] font-bold uppercase tracking-[0.14em]"
        style={{ color: 'var(--ds-ink-soft)' }}
      >
        Návrh {n} — {kicker}
      </p>
      <p className="mt-0.5 text-[1.02rem] font-black leading-tight">{title}</p>
      <div className="mt-3.5">{children}</div>
      <p className="mt-2.5 text-[0.8rem] leading-relaxed" style={{ color: 'var(--ds-ink-soft)' }}>
        {note}
      </p>
    </div>
  );
}

/** The press-scale every concept shares, as a hook rather than nine copies. */
function usePress() {
  const [down, setDown] = useState(false);
  return {
    pressed: down,
    handlers: {
      onPointerDown: () => setDown(true),
      onPointerUp: () => setDown(false),
      onPointerLeave: () => setDown(false),
      onPointerCancel: () => setDown(false),
    },
    style: {
      transform: down ? 'scale(0.975)' : 'scale(1)',
      transition: 'transform 90ms ease-out',
    } as CSSProperties,
  };
}

const FIELD: CSSProperties = {
  background: 'var(--ds-paper-hi)',
  boxShadow: 'inset 0 0 0 1px var(--ds-paper-edge)',
  color: 'var(--ds-ink)',
};

/* ------------------------------------------------------- 4 · odhalení -- */

function RevealCard() {
  const [shown, setShown] = useState(false);
  const press = usePress();
  return (
    <button
      type="button"
      onClick={() => setShown((s) => !s)}
      {...press.handlers}
      className="flex min-h-[84px] w-full flex-col items-start justify-center gap-1.5 rounded-xl px-4 py-3.5 text-left"
      style={{ ...FIELD, ...press.style }}
    >
      <span className="text-[1.1rem] font-semibold">nájemní smlouva</span>
      {shown ? (
        <span className="text-[1rem]" style={{ color: 'var(--ds-sea-deep)' }}>
          hợp đồng thuê nhà
        </span>
      ) : (
        <span className="text-[0.86rem]" style={{ color: 'var(--ds-ink-soft)' }}>
          ✧ Ťukni pro překlad
        </span>
      )}
    </button>
  );
}

/* ----------------------------------------------------- 5 · výslovnost -- */

const WAVE_BARS = 9;

function PlayWave() {
  const [tick, setTick] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const press = usePress();

  useEffect(() => {
    if (tick === null) return undefined;
    const id = window.setInterval(
      () =>
        setTick((t) => {
          if (t === null) return null;
          if (t > (slow ? 34 : 24)) {
            setSlow(false);
            return null;
          }
          return t + 1;
        }),
      slow ? 100 : 70,
    );
    return () => window.clearInterval(id);
  }, [tick === null, slow]); // eslint-disable-line react-hooks/exhaustive-deps

  const playing = tick !== null;
  return (
    <button
      type="button"
      aria-label="Přehrát výslovnost"
      onClick={() => {
        if (playing && !slow) return setSlow(true);
        if (playing) {
          setSlow(false);
          return setTick(null);
        }
        return setTick(0);
      }}
      {...press.handlers}
      className="flex h-12 items-center gap-3 rounded-full pl-3.5 pr-4"
      style={{ ...FIELD, ...press.style }}
    >
      <span className="text-[1rem]" style={{ color: 'var(--ds-sea-base)' }}>
        {playing ? '❚❚' : '▶'}
      </span>
      <svg width="76" height="20" viewBox="0 0 76 20" aria-hidden="true">
        {Array.from({ length: WAVE_BARS }, (_, i) => {
          const h = playing
            ? 4 + Math.round(Math.abs(Math.sin(((tick ?? 0) + i * 1.3) / 2.2)) * 12)
            : 4;
          return (
            <rect
              key={i}
              x={i * 9}
              y={10 - h / 2}
              width="3"
              height={h}
              rx="1.5"
              fill={playing ? 'var(--ds-sea-base)' : 'var(--ds-ink-faint)'}
            />
          );
        })}
      </svg>
      <span
        className="min-w-[34px] font-mono text-[0.78rem]"
        style={{ color: 'var(--ds-ink-soft)' }}
      >
        {slow ? '0,7×' : '1,0×'}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------- 6 · směr -- */

const DIRECTIONS = [
  { label: 'Čeština → Tiếng Việt', note: 'Rozpoznávání — vidíš české slovo, vybavuješ význam.' },
  {
    label: 'Tiếng Việt → Čeština',
    note: 'Vybavování — těžší směr, ale drží slovo v aktivní slovní zásobě.',
  },
];

function DirectionSwitch() {
  const [i, setI] = useState(0);
  return (
    <div>
      <div
        className="relative grid grid-cols-2 rounded-xl p-1"
        style={{ background: 'var(--ds-sand)', boxShadow: 'inset 0 0 0 1px var(--ds-paper-edge)' }}
      >
        <span
          aria-hidden="true"
          className="absolute left-1 top-1 rounded-lg"
          style={{
            width: 'calc(50% - 0.25rem)',
            height: 'calc(100% - 0.5rem)',
            background: 'var(--ds-paper-hi)',
            boxShadow: '0 1px 0 var(--ds-paper-edge), 0 6px 14px -10px rgba(42,34,24,0.6)',
            transform: i ? 'translateX(calc(100% + 0.5rem))' : 'translateX(0)',
            transition: 'transform 200ms cubic-bezier(0.2,0,0,1)',
          }}
        />
        {DIRECTIONS.map((d, index) => (
          <button
            key={d.label}
            type="button"
            onClick={() => setI(index)}
            className="relative h-10 text-[0.86rem] font-bold"
            style={{ color: i === index ? 'var(--ds-ink)' : 'var(--ds-ink-soft)' }}
          >
            {d.label}
          </button>
        ))}
      </div>
      <p className="mt-2.5 text-[0.8rem]" style={{ color: 'var(--ds-ink-soft)' }}>
        {DIRECTIONS[i].note}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------- 7 · undo -- */

const RING = 50.3;

function UndoCountdown() {
  const [phase, setPhase] = useState<'idle' | 'armed' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const press = usePress();

  useEffect(() => {
    if (phase !== 'armed') return undefined;
    let raf = 0;
    let start: number | null = null;
    const step = (ts: number) => {
      start ??= ts;
      const p = Math.min((ts - start) / 5000, 1);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
      else setPhase('idle');
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'done') return undefined;
    const id = window.setTimeout(() => {
      setPhase('idle');
      setProgress(0);
    }, 1200);
    return () => window.clearTimeout(id);
  }, [phase]);

  const label =
    phase === 'done'
      ? 'Vráceno zpět'
      : phase === 'armed'
        ? `Vrátit hodnocení · ${Math.max(1, Math.ceil(5 - progress * 5))} s`
        : 'Ťukni pro simulaci hodnocení';

  return (
    <button
      type="button"
      onClick={() => setPhase((p) => (p === 'armed' ? 'done' : p === 'idle' ? 'armed' : p))}
      {...press.handlers}
      className="flex h-11 items-center gap-2.5 rounded-xl px-4 text-[0.86rem] font-bold"
      style={{
        ...FIELD,
        ...press.style,
        boxShadow: `inset 0 0 0 ${phase === 'armed' ? '2px var(--ds-sea-base)' : '1px var(--ds-paper-edge)'}`,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="flex-none">
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--ds-ink-faint)" strokeWidth="2" />
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke={phase === 'done' ? 'var(--ds-moss-base)' : 'var(--ds-sea-base)'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING}
          strokeDashoffset={phase === 'done' ? 0 : RING * (1 - progress)}
          transform="rotate(-90 10 10)"
        />
      </svg>
      {label}
    </button>
  );
}

/* ------------------------------------------------------- 8 · setření -- */

const SCRATCH_COLS = 9;
const SCRATCH_ROWS = 3;
const SCRATCH_TILES = SCRATCH_COLS * SCRATCH_ROWS;
/** Past this much rubbed away the rest gives up — nobody should have to colour in. */
const SCRATCH_DONE = 0.55;

function ScratchReveal() {
  const [gone, setGone] = useState<Set<number>>(new Set());
  const done = gone.size / SCRATCH_TILES >= SCRATCH_DONE;

  const rub = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.buttons === 0 && event.pointerType === 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const col = Math.floor(((event.clientX - rect.left) / rect.width) * SCRATCH_COLS);
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * SCRATCH_ROWS);
    if (col < 0 || row < 0 || col >= SCRATCH_COLS || row >= SCRATCH_ROWS) return;
    setGone((prev) => {
      const next = new Set(prev);
      /* A finger is wider than one tile — take the neighbours too, or rubbing
         feels like drawing a one-pixel line. */
      for (let dc = -1; dc <= 1; dc += 1) {
        const c = col + dc;
        if (c >= 0 && c < SCRATCH_COLS) next.add(row * SCRATCH_COLS + c);
      }
      return next;
    });
  }, []);

  return (
    <div>
      <div
        onPointerDown={rub}
        onPointerMove={rub}
        className="relative min-h-[84px] touch-none select-none overflow-hidden rounded-xl px-4 py-3.5"
        style={FIELD}
      >
        <p className="text-[1.1rem] font-semibold">nájemní smlouva</p>
        <p className="mt-1 text-[1rem]" style={{ color: 'var(--ds-sea-deep)' }}>
          hợp đồng thuê nhà
        </p>

        <div
          aria-hidden="true"
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${SCRATCH_COLS}, 1fr)`,
            gridTemplateRows: `repeat(${SCRATCH_ROWS}, 1fr)`,
            opacity: done ? 0 : 1,
            transition: 'opacity 240ms ease-out',
            pointerEvents: 'none',
          }}
        >
          {Array.from({ length: SCRATCH_TILES }, (_, i) => (
            <span
              key={i}
              style={{
                background: 'var(--ds-sand)',
                opacity: gone.has(i) ? 0 : 1,
                transition: 'opacity 140ms ease-out',
              }}
            />
          ))}
        </div>

        {gone.size === 0 ? (
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[0.86rem] font-bold"
            style={{ color: 'var(--ds-ink-soft)' }}
          >
            ✧ Přejeď prstem
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setGone(new Set())}
        className="mt-2 text-[0.75rem] font-bold underline"
        style={{ color: 'var(--ds-ink-soft)' }}
      >
        znovu zakrýt
      </button>
    </div>
  );
}

/* --------------------------------------------------------- 9 · žebřík -- */

const LADDER = ['5 minut', '1 den', '3 dny', '10 dní', '30 dní', '60 dní'];
const HOLD_MS = 220;

function IntervalLadder() {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);
  const holdRef = useRef(0);
  const railRef = useRef<HTMLDivElement | null>(null);

  const track = (event: ReactPointerEvent) => {
    const rail = railRef.current;
    if (!open || !rail) return;
    const rect = rail.getBoundingClientRect();
    const i = Math.floor(((event.clientY - rect.top) / rect.height) * LADDER.length);
    setHover(Math.min(LADDER.length - 1, Math.max(0, i)));
  };

  return (
    <div className="relative pt-[168px]">
      {open ? (
        <div
          ref={railRef}
          className="absolute inset-x-0 top-0 grid overflow-hidden rounded-xl"
          style={{
            height: '160px',
            background: 'var(--ds-paper-hi)',
            boxShadow: 'inset 0 0 0 1px var(--ds-paper-edge), 0 16px 34px -22px rgba(42,34,24,0.7)',
          }}
        >
          {LADDER.map((step, i) => (
            <span
              key={step}
              className="flex items-center justify-between px-3.5 text-[0.84rem] font-bold"
              style={{
                background: i === hover ? 'var(--ds-sea-base)' : 'transparent',
                color: i === hover ? 'var(--ds-paper)' : 'var(--ds-ink-soft)',
              }}
            >
              {step}
              {i === hover ? <span>←</span> : null}
            </span>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onPointerDown={() => {
          holdRef.current = window.setTimeout(() => setOpen(true), HOLD_MS);
        }}
        onPointerMove={track}
        onPointerUp={() => {
          window.clearTimeout(holdRef.current);
          setPicked(open ? LADDER[hover] : '1 den');
          setOpen(false);
        }}
        onPointerCancel={() => {
          window.clearTimeout(holdRef.current);
          setOpen(false);
        }}
        className="flex h-12 w-full touch-none items-center justify-center rounded-xl text-[0.9rem] font-black"
        style={{
          background: open ? 'var(--ds-sea-deep)' : 'var(--ds-sea-base)',
          color: 'var(--ds-paper)',
        }}
      >
        {open ? `Odložit o ${LADDER[hover]}` : 'Umím ✓'}
      </button>

      <p className="mt-2 text-[0.8rem] font-bold" style={{ color: 'var(--ds-moss-deep)' }}>
        {picked ? `Uloženo — příště za ${picked}.` : ' '}
      </p>
    </div>
  );
}

/* ------------------------------------------------------- 10 · jistota -- */

const CERTAINTY = [
  { label: 'netuším', due: 'za 5 minut', color: 'brick' },
  { label: 'skoro', due: 'za 10 minut', color: 'brick' },
  { label: 's námahou', due: 'zítra', color: 'ochre' },
  { label: 'šlo to', due: 'za 3 dny', color: 'moss' },
  { label: 'hned mě to napadlo', due: 'za 10 dní', color: 'moss' },
] as const;

function CertaintySlider() {
  const [i, setI] = useState(2);
  const [committed, setCommitted] = useState(false);
  const step = CERTAINTY[i];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.9rem] font-black" style={{ color: `var(--ds-${step.color}-deep)` }}>
          {step.label}
        </span>
        <span className="font-mono text-[0.78rem]" style={{ color: 'var(--ds-ink-soft)' }}>
          {step.due}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={CERTAINTY.length - 1}
        step={1}
        value={i}
        aria-label="Jak jistě sis vzpomněl"
        onChange={(e) => {
          setI(Number(e.target.value));
          setCommitted(false);
        }}
        onPointerUp={() => setCommitted(true)}
        onKeyUp={() => setCommitted(true)}
        className="ds-certainty mt-2 w-full"
        style={
          {
            '--ds-certainty-fill': `var(--ds-${step.color}-base)`,
            '--ds-certainty-progress': `${(i / (CERTAINTY.length - 1)) * 100}%`,
          } as CSSProperties
        }
      />

      <div className="mt-1 flex justify-between text-[0.72rem]" style={{ color: 'var(--ds-ink-faint)' }}>
        <span>nevím</span>
        <span>vím</span>
      </div>

      <p className="mt-2 text-[0.8rem] font-bold" style={{ color: `var(--ds-${step.color}-deep)` }}>
        {committed ? `Uloženo — ${step.due}.` : ' '}
      </p>
    </div>
  );
}

/* -------------------------------------------------------- 11 · pomůcka -- */

function MemoryHookField() {
  const [state, setState] = useState<'idle' | 'editing' | 'saved'>('idle');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (state === 'editing') ref.current?.focus();
  }, [state]);

  if (state === 'editing') {
    return (
      <div className="rounded-xl p-2.5" style={FIELD}>
        <textarea
          ref={ref}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="hợp đồng — „hop dong“, zvoní to jak podpis na papír"
          className="w-full resize-none bg-transparent text-[0.88rem] leading-snug outline-none"
          style={{ color: 'var(--ds-ink)' }}
        />
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setText(draft.trim());
              setState(draft.trim() ? 'saved' : 'idle');
            }}
            className="rounded-full px-3 py-1 text-[0.78rem] font-black"
            style={{ background: 'var(--ds-plum-base)', color: 'var(--ds-paper)' }}
          >
            Uložit
          </button>
          <button
            type="button"
            onClick={() => setState(text ? 'saved' : 'idle')}
            className="text-[0.78rem] font-bold underline"
            style={{ color: 'var(--ds-ink-soft)' }}
          >
            Zahodit
          </button>
        </div>
      </div>
    );
  }

  if (state === 'saved') {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(text);
          setState('editing');
        }}
        className="w-full rounded-xl px-3.5 py-2.5 text-left text-[0.86rem] leading-snug"
        style={{
          background: 'var(--ds-plum-wash)',
          color: 'var(--ds-plum-deep)',
          boxShadow: 'inset 0 0 0 1px var(--ds-plum-base)',
        }}
      >
        <span className="mr-1.5 font-black">✎</span>
        {text}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(text);
        setState('editing');
      }}
      className="h-11 rounded-full px-4 text-[0.84rem] font-black"
      style={{
        background: 'transparent',
        color: 'var(--ds-plum-base)',
        boxShadow: 'inset 0 0 0 1.5px var(--ds-plum-base)',
      }}
    >
      + Pomůcka
    </button>
  );
}

/* --------------------------------------------------------- 12 · dvojice -- */

const PAIRS = [
  { cs: 'ráno', vi: 'buổi sáng' },
  { cs: 'klíč', vi: 'chìa khóa' },
  { cs: 'účet', vi: 'hóa đơn' },
];
/** The right column, deliberately out of order. */
const RIGHT_ORDER = [2, 0, 1];
const ROW_H = 44;
const ROW_GAP = 10;

function MatchingLink() {
  const [picked, setPicked] = useState<number | null>(null);
  const [linked, setLinked] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number | null>(null);

  useEffect(() => {
    if (wrong === null) return undefined;
    const id = window.setTimeout(() => setWrong(null), 420);
    return () => window.clearTimeout(id);
  }, [wrong]);

  const height = PAIRS.length * ROW_H + (PAIRS.length - 1) * ROW_GAP;
  const centre = (row: number) => row * (ROW_H + ROW_GAP) + ROW_H / 2;

  const chip = (index: number, side: 'cs' | 'vi', row: number) => {
    const isLinked = linked.includes(index);
    const isPicked = side === 'cs' && picked === index;
    const isWrong = wrong === index;
    return (
      <button
        key={`${side}-${index}`}
        type="button"
        disabled={isLinked}
        onClick={() => {
          if (side === 'cs') return setPicked(index);
          if (picked === null) return undefined;
          if (picked === index) {
            setLinked((l) => [...l, index]);
            setPicked(null);
            return undefined;
          }
          setWrong(index);
          setPicked(null);
          return undefined;
        }}
        className="flex items-center justify-center rounded-xl px-2 text-[0.86rem] font-bold"
        style={{
          gridRow: row + 1,
          height: ROW_H,
          background: isLinked
            ? 'var(--ds-moss-wash)'
            : isWrong
              ? 'var(--ds-brick-wash)'
              : isPicked
                ? 'var(--ds-sea-base)'
                : 'var(--ds-paper-hi)',
          color: isLinked
            ? 'var(--ds-moss-deep)'
            : isWrong
              ? 'var(--ds-brick-deep)'
              : isPicked
                ? 'var(--ds-paper)'
                : 'var(--ds-ink)',
          boxShadow: `inset 0 0 0 1px ${
            isLinked
              ? 'var(--ds-moss-base)'
              : isWrong
                ? 'var(--ds-brick-base)'
                : 'var(--ds-paper-edge)'
          }`,
          transition: 'background 160ms, color 160ms',
        }}
      >
        {side === 'cs' ? PAIRS[index].cs : PAIRS[index].vi}
      </button>
    );
  };

  return (
    <div>
      <div className="relative" style={{ height }}>
        {/* The ink between the columns. Drawn in a stretched viewBox so x is a
            percentage of the width and y stays in real pixels. */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          width="100%"
          height={height}
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
        >
          {linked.map((index) => (
            <line
              key={index}
              x1="42"
              y1={centre(index)}
              x2="58"
              y2={centre(RIGHT_ORDER.indexOf(index))}
              stroke="var(--ds-moss-base)"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        <div
          className="grid h-full"
          style={{
            gridTemplateColumns: '1fr 16% 1fr',
            gridTemplateRows: `repeat(${PAIRS.length}, ${ROW_H}px)`,
            rowGap: ROW_GAP,
          }}
        >
          <div className="col-start-1 row-span-full grid" style={{ rowGap: ROW_GAP }}>
            {PAIRS.map((_, row) => chip(row, 'cs', row))}
          </div>
          <div className="col-start-3 row-span-full grid" style={{ rowGap: ROW_GAP }}>
            {RIGHT_ORDER.map((index, row) => chip(index, 'vi', row))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setLinked([]);
          setPicked(null);
        }}
        className="mt-2.5 text-[0.75rem] font-bold underline"
        style={{ color: 'var(--ds-ink-soft)' }}
      >
        rozpojit
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- export -- */

/** The range input's track and thumb, which no inline style can reach. */
export const CONCEPT_CSS = `
.ds-certainty {
  -webkit-appearance: none;
  appearance: none;
  height: 26px;
  background: transparent;
  cursor: pointer;
}
.ds-certainty::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(90deg,
    var(--ds-certainty-fill) 0 var(--ds-certainty-progress),
    var(--ds-ink-faint) var(--ds-certainty-progress) 100%);
}
.ds-certainty::-moz-range-track {
  height: 6px; border-radius: 999px; background: var(--ds-ink-faint);
}
.ds-certainty::-moz-range-progress {
  height: 6px; border-radius: 999px; background: var(--ds-certainty-fill);
}
.ds-certainty::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 24px; height: 24px; margin-top: -9px;
  border-radius: 999px;
  background: var(--ds-paper);
  border: 2px solid var(--ds-certainty-fill);
  box-shadow: 0 4px 10px -6px rgba(42,34,24,0.9);
}
.ds-certainty::-moz-range-thumb {
  width: 22px; height: 22px; border-radius: 999px;
  background: var(--ds-paper);
  border: 2px solid var(--ds-certainty-fill);
}
`;

export function InteractionConcepts() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Concept
        n={4}
        kicker="Kartička"
        title="Odhalení jedním ťuknutím"
        note="Celá kartička je tlačítko — není kam minout."
      >
        <RevealCard />
      </Concept>

      <Concept
        n={5}
        kicker="Výslovnost"
        title="Přehrávání jako vlna"
        note="Druhé ťuknutí během přehrávání zpomalí na 0,7×, třetí zastaví."
      >
        <PlayWave />
      </Concept>

      <Concept
        n={6}
        kicker="Směr učení"
        title="Přepínač s jezdcem"
        note="Pozor: aplikace dnes směr bere ze seznamu (language_from → language_to) a lokálně ho otočit neumí. Tenhle přepínač je návrh chování, ne převlek za existující."
      >
        <DirectionSwitch />
      </Concept>

      <Concept
        n={7}
        kicker="Záchranná brzda"
        title="Vrátit zpět s odpočtem"
        note="Po překliku máš pět vteřin. Pak zmizí."
      >
        <UndoCountdown />
      </Concept>

      <Concept
        n={8}
        kicker="Odhalení podruhé"
        title="Setřít místo ťuknutí"
        note="Stejný krok jako Návrh 4, ale stojí tě pohyb — a ten pohyb je ta chvilka, kdy si slovo zkusíš vybavit. Nad 55 % setřeného zbytek zmizí sám, aby se nemuselo vybarvovat."
      >
        <ScratchReveal />
      </Concept>

      <Concept
        n={9}
        kicker="Odložení"
        title="Podrž a vyber ze žebříku"
        note="Ťuknutí = běžné „Umím“. Podržení otevře jedenáctistupňový žebřík a vybíráš tažením palce, bez zvednutí prstu. Jedno tlačítko místo tlačítka a popoveru."
      >
        <IntervalLadder />
      </Concept>

      <Concept
        n={10}
        kicker="Hodnocení"
        title="Jezdec jistoty místo dvou tlačítek"
        note="Správně/chybně je hrubé síto. Jezdec pošle do SRS rovnou odstín — a barva pod palcem ukazuje, co to udělá s intervalem, ještě než pustíš."
      >
        <CertaintySlider />
      </Concept>

      <Concept
        n={11}
        kicker="Pomůcka"
        title="Pole, které se rozbalí na místě"
        note="Tlačítko se nepřepne na jinou obrazovku — stane se tím polem a po uložení se scvrkne do štítku, který je zase tlačítko. Kartička se pod tím nikam nehne."
      >
        <MemoryHookField />
      </Concept>

      <Concept
        n={12}
        kicker="Párování"
        title="Ťukni a ťukni — spojí se inkoustem"
        note="Bez tažení: první ťuknutí vybere, druhé spojí. Správná dvojice si mezi sebou natáhne čáru a zmrzne, špatná jen blikne a pustí výběr."
      >
        <MatchingLink />
      </Concept>
    </div>
  );
}
