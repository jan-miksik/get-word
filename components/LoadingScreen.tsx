'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { AppLogo } from '@/components/AppLogo';

const ORDINARY_LATIN_GLYPHS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
];

const ACCENTED_LATIN_GLYPHS = [
  'á', 'à', 'â', 'ä', 'å', 'æ', 'č', 'ç', 'ď', 'é', 'è', 'ê', 'ë',
  'í', 'î', 'ï', 'ł', 'ñ', 'ó', 'ô', 'ö', 'ø', 'ř', 'š', 'ß', 'ť',
  'ú', 'ü', 'ý', 'ž',
];

const EXOTIC_GLYPHS = [
  'Д', 'Ж', 'Σ', 'Ψ', '語', '字', 'अ', 'ع', 'ก', 'ア', 'ㅎ',
  'ა', 'ב', 'Ω', 'λ', 'ξ', 'ð', 'þ', 'ő',
];

const PARTICLE_COUNT = 48;

function seededUnit(index: number, salt: number) {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

function pickGlyph(weight: number, glyphIndex: number) {
  const glyphs = weight < 0.74
    ? ORDINARY_LATIN_GLYPHS
    : weight < 0.9
      ? ACCENTED_LATIN_GLYPHS
      : EXOTIC_GLYPHS;

  return glyphs[Math.floor(glyphIndex * glyphs.length)];
}

function makeParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const r1 = seededUnit(i, 1);
    const r2 = seededUnit(i, 2);
    const r3 = seededUnit(i, 3);
    const r4 = seededUnit(i, 4);
    return {
      char: pickGlyph(r3, r4),
      left: r1 * 92 + 4,
      top: r2 * 104 + 6,
      delay: `${-(r1 * 18).toFixed(2)}s`,
      duration: `${(18 + r2 * 18).toFixed(3)}s`,
      size: `${(0.58 + r3 * 1.45).toFixed(3)}rem`,
      opacity: (0.1 + r2 * 0.16).toFixed(3),
      animType: i % 3,
      rotate: Math.floor(r1 * 32 - 16),
    };
  });
}

const FOG_LAYERS = [
  { inset: '-10px', bg: 'rgba(255, 247, 239, 0.72)', freq: 0.31, txS: 14, tyS: 12 },
  { inset: '5px',   bg: 'rgba(230, 111, 45, 0.14)',  freq: 0.19, txS: 11, tyS: 9  },
  { inset: '-20px', bg: 'rgba(91, 143, 185, 0.10)',  freq: 0.23, txS: 18, tyS: 15 },
  { inset: '15px',  bg: 'rgba(79, 47, 36, 0.08)',    freq: 0.41, txS: 10, tyS: 8  },
];

type LoaderVariant = 'A' | 'B' | 'C' | 'D';

interface LoadingScreenProps {
  ready?: boolean;
  onContinue?: () => void;
}

const SNAP_RADIUS = 120;
const FOLLOW_EASE = 0.18;
const BURST_DECAY = 0.88;
const IDLE_MOUSE = -10000;
const RELEASE_COOLDOWN_MS = 220;

type ParticleMotion = { x: number; y: number; vx: number; vy: number; following: boolean };

export function LoadingScreen({ ready, onContinue }: LoadingScreenProps) {
  const [variant, setVariant] = useState<LoaderVariant>('A');
  const containerRef = useRef<HTMLDivElement>(null);
  const particleRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const mouseRef = useRef({ x: IDLE_MOUSE, y: IDLE_MOUSE });
  const [particles] = useState<ReturnType<typeof makeParticles>>(makeParticles);
  const motionRef = useRef<ParticleMotion[]>(
    particles.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, following: false }))
  );
  const rafRef = useRef<number>(0);
  const lastWasTouchRef = useRef(false);
  const releaseCooldownUntilRef = useRef(0);

  const animate = useCallback(() => {
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;

    // Read all actual rendered positions before any DOM writes to avoid layout thrashing.
    // BCR accounts for the CSS animation transform, so snap/follow targets the visible letter.
    const centers: Array<[number, number] | null> = particleRefs.current.map(el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    });

    for (let i = 0; i < particles.length; i++) {
      const el = particleRefs.current[i];
      const center = centers[i];
      if (!el || !center) continue;

      const motion = motionRef.current[i];
      const [cx, cy] = center;
      const dx = mx - cx;
      const dy = my - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (mx !== IDLE_MOUSE && dist < SNAP_RADIUS) motion.following = true;

      if (motion.following && mx !== IDLE_MOUSE) {
        motion.vx = 0;
        motion.vy = 0;
        motion.x += dx * FOLLOW_EASE;
        motion.y += dy * FOLLOW_EASE;
      } else {
        motion.vx *= BURST_DECAY;
        motion.vy *= BURST_DECAY;
        motion.x += motion.vx;
        motion.y += motion.vy;
        if (Math.abs(motion.vx) < 0.1) motion.vx = 0;
        if (Math.abs(motion.vy) < 0.1) motion.vy = 0;
        if (motion.vx === 0 && motion.vy === 0) {
          motion.x *= 0.94;
          motion.y *= 0.94;
        }
      }

      if (Math.abs(motion.x) > 0.5 || Math.abs(motion.y) > 0.5) {
        el.style.setProperty('--ix', `${motion.x.toFixed(1)}px`);
        el.style.setProperty('--iy', `${motion.y.toFixed(1)}px`);
      } else {
        el.style.setProperty('--ix', '0px');
        el.style.setProperty('--iy', '0px');
      }
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [particles]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (performance.now() < releaseCooldownUntilRef.current) return;
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: IDLE_MOUSE, y: IDLE_MOUSE };
    motionRef.current.forEach(m => { m.following = false; });
  }, []);

  const releaseFollowingParticles = useCallback(() => {
    releaseCooldownUntilRef.current = performance.now() + RELEASE_COOLDOWN_MS;
    mouseRef.current = { x: IDLE_MOUSE, y: IDLE_MOUSE };
    motionRef.current.forEach((motion) => {
      motion.following = false;
      motion.vx = 0;
      motion.vy = 0;
    });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    lastWasTouchRef.current = true;
    releaseFollowingParticles();
  }, [releaseFollowingParticles]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    if (performance.now() < releaseCooldownUntilRef.current) return;
    mouseRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(() => {
    mouseRef.current = { x: IDLE_MOUSE, y: IDLE_MOUSE };
    motionRef.current.forEach(m => { m.following = false; });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (lastWasTouchRef.current) { lastWasTouchRef.current = false; return; }
    releaseFollowingParticles();
  }, [releaseFollowingParticles]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden ls-root"
    >
      {particles.map((p, i) => (
        <span
          key={i}
          ref={el => { particleRefs.current[i] = el; }}
          className={`absolute pointer-events-none select-none ls-word ls-word-${p.animType}`}
          style={{
            left: `${p.left.toFixed(1)}%`,
            top: `${p.top.toFixed(1)}%`,
            fontSize: p.size,
            opacity: p.opacity,
            animationDuration: p.duration,
            animationDelay: p.delay,
            '--rotate': `${p.rotate}deg`,
            '--letter-opacity': p.opacity,
            '--ix': '0px',
            '--iy': '0px',
          } as React.CSSProperties}
        >
          {p.char}
        </span>
      ))}

      <div className="relative z-10 flex flex-col items-center">
        {variant === 'A' && <LoaderA />}
        {variant === 'B' && <LoaderB />}
        {variant === 'C' && <LoaderC />}
        {variant === 'D' && <LoaderD />}
      </div>

      <button
        disabled={!ready}
        onClick={onContinue}
        className={`
          relative z-10 mt-14 px-8 py-3 rounded-full text-sm font-medium tracking-wide
          transition-all duration-300 ease-out
          ${ready
            ? 'bg-[#4f2f24] text-[#fff7ef] shadow-[0_16px_38px_rgba(79,47,36,0.22)] hover:shadow-[0_20px_45px_rgba(79,47,36,0.3)] hover:scale-105 cursor-pointer'
            : 'bg-[#4f2f24]/8 text-[#4f2f24]/30 border border-[#4f2f24]/10 cursor-not-allowed'
          }
        `}
      >
        {ready ? 'Continue' : 'Loading…'}
      </button>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex gap-2">
        {(['A', 'B', 'C', 'D'] as const).map(v => (
          <button
            key={v}
            onClick={() => setVariant(v)}
            className={`
              w-9 h-9 rounded-lg text-xs font-bold transition-all duration-200
              ${variant === v
                ? 'bg-[#4f2f24] text-[#fff7ef] shadow-[0_12px_22px_rgba(79,47,36,0.2)]'
                : 'bg-[#fff7ef]/45 text-[#4f2f24]/55 hover:bg-[#fff7ef]/70 hover:text-[#4f2f24] border border-[#4f2f24]/10'
              }
            `}
          >
            {v}
          </button>
        ))}
      </div>

      <style>{`
        .ls-root {
          background: #fefff5fa;
        }

        .ls-word {
          color: rgba(79, 47, 36, 0.76);
          font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
          font-weight: 650;
          letter-spacing: 0.02em;
          white-space: nowrap;
          will-change: transform;
          text-shadow: 0 6px 18px rgba(79, 47, 36, 0.12);
          transition: none;
        }
        .ls-word-0 { animation: ls-rise-straight linear infinite; }
        .ls-word-1 { animation: ls-rise-sway linear infinite; }
        .ls-word-2 { animation: ls-rise-tilt linear infinite; }

        @keyframes ls-rise-straight {
          0%   { transform: translate(calc(0px + var(--ix)), calc(76px + var(--iy))) rotate(var(--rotate)); opacity: 0; }
          12%  { opacity: var(--letter-opacity, 1); }
          72%  { opacity: var(--letter-opacity, 1); }
          100% { transform: translate(calc(8px + var(--ix)), calc(-118vh + var(--iy))) rotate(calc(var(--rotate) + 9deg)); opacity: 0; }
        }
        @keyframes ls-rise-sway {
          0%   { transform: translate(calc(0px + var(--ix)), calc(92px + var(--iy))) rotate(var(--rotate)); opacity: 0; }
          14%  { opacity: var(--letter-opacity, 1); }
          42%  { transform: translate(calc(-28px + var(--ix)), calc(-40vh + var(--iy))) rotate(calc(var(--rotate) - 7deg)); }
          76%  { opacity: var(--letter-opacity, 1); }
          100% { transform: translate(calc(22px + var(--ix)), calc(-120vh + var(--iy))) rotate(calc(var(--rotate) + 12deg)); opacity: 0; }
        }
        @keyframes ls-rise-tilt {
          0%   { transform: translate(calc(0px + var(--ix)), calc(84px + var(--iy))) rotate(var(--rotate)); opacity: 0; }
          10%  { opacity: var(--letter-opacity, 1); }
          50%  { transform: translate(calc(32px + var(--ix)), calc(-48vh + var(--iy))) rotate(calc(var(--rotate) + 14deg)); }
          78%  { opacity: var(--letter-opacity, 1); }
          100% { transform: translate(calc(-18px + var(--ix)), calc(-116vh + var(--iy))) rotate(calc(var(--rotate) - 10deg)); opacity: 0; }
        }

        /* === Loader A === */
        .ls-fog-wrap {
          position: relative;
          width: 220px;
          height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ls-fog {
          position: absolute;
          filter: blur(30px);
          will-change: transform, border-radius;
        }

        /* === Loader B === */
        .ls-breathe { opacity: 1; }
        .ls-underglow {
          position: absolute;
          inset: -20px;
          border-radius: 30%;
          background: radial-gradient(circle, rgba(79, 47, 36, 0.1), transparent 70%);
        }
        /* === Loader C: ASCII scan box === */
        .ls-ascii-box {
          position: relative;
          display: inline-block;
          overflow: hidden;
          border-radius: 4px;
        }
        .ls-ascii-pre {
          font-family: "SF Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace;
          font-size: 0.82rem;
          line-height: 1.55;
          color: rgba(79, 47, 36, 0.78);
          text-shadow: 0 8px 22px rgba(79, 47, 36, 0.12);
          white-space: pre;
          user-select: none;
          margin: 0;
        }
        .ls-ascii-scan {
          position: absolute;
          top: -100%; left: 0; right: 0;
          height: 100%;
          background: linear-gradient(180deg,
            transparent 0%,
            rgba(255, 247, 239, 0.18) 48%,
            rgba(230, 111, 45, 0.18) 50%,
            rgba(255, 247, 239, 0.18) 52%,
            transparent 100%
          );
          animation: ls-scan-vert 2.8s linear infinite;
          pointer-events: none;
        }
        @keyframes ls-scan-vert {
          0%   { top: -100%; }
          100% { top: 100%; }
        }

        /* === Loader D: Terminal === */
        .ls-terminal-pre {
          font-family: "SF Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace;
          font-size: 0.8rem;
          line-height: 1.6;
          color: rgba(79, 47, 36, 0.76);
          text-shadow: 0 8px 20px rgba(79, 47, 36, 0.11);
          white-space: pre;
          user-select: none;
          margin: 0;
        }
        .ls-cursor {
          display: inline-block;
          width: 0.5em;
          height: 1em;
          background: rgba(79, 47, 36, 0.72);
          vertical-align: text-bottom;
          animation: ls-blink 1.1s step-end infinite;
        }
        @keyframes ls-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function LoaderA() {
  const fogRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);

  useEffect(() => {
    const seeds = FOG_LAYERS.map(() => Math.random() * 100);
    let rafId: number;

    function tick() {
      const t = performance.now() / 1000;
      FOG_LAYERS.forEach((layer, i) => {
        const el = fogRefs.current[i];
        if (!el) return;
        const s = seeds[i];
        const f = layer.freq;

        const tx = Math.sin(t * f + s) * layer.txS + Math.sin(t * f * 0.7 + s + 2.1) * layer.txS * 0.35;
        const ty = Math.cos(t * f * 0.83 + s + 1.3) * layer.tyS + Math.cos(t * f * 1.2 + s) * layer.tyS * 0.28;
        const sx = 1 + Math.sin(t * f * 1.1 + s + 0.7) * 0.13 + Math.sin(t * f * 0.5 + s + 3) * 0.05;
        const sy = 1 + Math.cos(t * f * 0.9 + s + 1.4) * 0.13 + Math.cos(t * f * 1.4 + s) * 0.05;

        const a = 50 + Math.sin(t * f * 0.6 + s) * 13 + Math.sin(t * f * 1.3 + s + 1.7) * 5;
        const c = 50 + Math.cos(t * f * 0.8 + s + 0.9) * 11 + Math.cos(t * f * 1.1 + s + 2.5) * 4;
        const b = 100 - a, d = 100 - c;

        el.style.borderRadius = `${a.toFixed(0)}% ${b.toFixed(0)}% ${c.toFixed(0)}% ${d.toFixed(0)}% / ${d.toFixed(0)}% ${c.toFixed(0)}% ${b.toFixed(0)}% ${a.toFixed(0)}%`;
        el.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
      });
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="ls-fog-wrap">
      {FOG_LAYERS.map((layer, i) => (
        <div
          key={i}
          ref={el => { fogRefs.current[i] = el; }}
          className="ls-fog"
          style={{ inset: layer.inset, background: layer.bg }}
        />
      ))}
      <div className="relative z-10">
        <AppLogo
          size={64}
          showLabel
          className="flex-col gap-3"
          labelClassName="text-[#4f2f24]/55 text-[0.62rem] tracking-[0.45em]"
        />
      </div>
    </div>
  );
}

function LoaderB() {
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative">
        <div className="ls-underglow" />
        <div className="ls-breathe">
          <AppLogo
            size={88}
            showLabel
            className="flex-col gap-5"
            labelClassName="text-[#4f2f24]/55 text-[0.65rem] tracking-[0.45em]"
          />
        </div>
      </div>
    </div>
  );
}

function LoaderC() {
  return (
    <div className="flex flex-col items-center gap-5">
      <AppLogo
        size={44}
        showLabel
        className="flex-col gap-2"
        labelClassName="text-[#4f2f24]/45 text-[0.58rem] tracking-[0.45em]"
      />
      <div className="ls-ascii-box">
        <pre className="ls-ascii-pre">{
`╔═════════════════════╗
║                     ║
║  W O R D L I N K   ║
║                     ║
╠═════════════════════╣
║  loading words...   ║
╚═════════════════════╝`
        }</pre>
        <div className="ls-ascii-scan" />
      </div>
    </div>
  );
}

function LoaderD() {
  const [vals, setVals] = useState([0, 0, 0]);

  useEffect(() => {
    const targets = [
      55 + Math.random() * 30,
      30 + Math.random() * 40,
      15 + Math.random() * 35,
    ];
    const speeds = [0.9, 0.55, 0.32];

    const id = setInterval(() => {
      setVals(prev => {
        let done = true;
        const next = prev.map((v, i) => {
          if (v >= targets[i]) return v;
          done = false;
          return Math.min(v + speeds[i] + Math.random() * 0.7, targets[i]);
        });
        if (done) clearInterval(id);
        return next;
      });
    }, 55);

    return () => clearInterval(id);
  }, []);

  const BAR = 8;
  const bar = (v: number) => {
    const f = Math.round((v / 100) * BAR);
    return '█'.repeat(f) + '░'.repeat(BAR - f);
  };
  const pct = (v: number) => Math.floor(v).toString().padStart(3);

  return (
    <div className="flex flex-col items-center gap-5">
      <AppLogo
        size={44}
        showLabel
        className="flex-col gap-2"
        labelClassName="text-[#4f2f24]/45 text-[0.58rem] tracking-[0.45em]"
      />
      <div>
        <pre className="ls-terminal-pre">{
`┌────────────────────────────┐
│  $ wordlink --initialize   │
│                            │
│  vocab   [${bar(vals[0])}] ${pct(vals[0])}%   │
│  syntax  [${bar(vals[1])}] ${pct(vals[1])}%   │
│  audio   [${bar(vals[2])}] ${pct(vals[2])}%   │
│                            │
└────────────────────────────┘`
        }</pre>
      </div>
    </div>
  );
}
