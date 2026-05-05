'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { AppLogo } from '@/components/AppLogo';

const GLYPHS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'M', 'R', 'W',
  'ñ', 'ü', 'ø', 'ß', 'ê', 'ç', 'à', 'é', 'î', 'ô',
  'Д', 'Σ', '語', 'अ', 'ع', 'ก', 'א', 'ა', 'ㅎ', 'Ω',
];

const PARTICLE_COUNT = 34;

function makeParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const r1 = Math.random();
    const r2 = Math.random();
    const r3 = Math.random();
    return {
      char: GLYPHS[Math.floor(r3 * GLYPHS.length)],
      left: r1 * 92 + 4,
      top: r2 * 90 + 5,
      delay: `${-(r1 * 10).toFixed(2)}s`,
      duration: `${(12 + r2 * 14).toFixed(3)}s`,
      size: `${(0.58 + r3 * 1.45).toFixed(3)}rem`,
      opacity: (0.06 + r2 * 0.14).toFixed(3),
      animType: i % 3,
      rotate: Math.floor(r1 * 32 - 16),
    };
  });
}

const FOG_LAYERS = [
  { inset: '-10px', bg: 'rgba(56, 189, 248, 0.18)', freq: 0.31, txS: 14, tyS: 12 },
  { inset: '5px',   bg: 'rgba(99, 102, 241, 0.12)', freq: 0.19, txS: 11, tyS: 9  },
  { inset: '-20px', bg: 'rgba(56, 189, 248, 0.09)', freq: 0.23, txS: 18, tyS: 15 },
  { inset: '15px',  bg: 'rgba(167, 139, 250, 0.08)',freq: 0.41, txS: 10, tyS: 8  },
];

type LoaderVariant = 'A' | 'B' | 'C' | 'D';

interface LoadingScreenProps {
  ready?: boolean;
  onContinue?: () => void;
}

const SNAP_RADIUS = 120;
const FOLLOW_EASE = 0.18;
const BURST_FORCE = 420;
const BURST_DECAY = 0.9;
const IDLE_MOUSE = -10000;

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

  const animate = useCallback(() => {
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;
    const container = containerRef.current;
    if (!container) { rafRef.current = requestAnimationFrame(animate); return; }

    const rect = container.getBoundingClientRect();

    for (let i = 0; i < particles.length; i++) {
      const el = particleRefs.current[i];
      if (!el) continue;

      const p = particles[i];
      const px = rect.left + (p.left / 100) * rect.width;
      const py = rect.top + (p.top / 100) * rect.height;
      const motion = motionRef.current[i];

      const dx = mx - px - motion.x;
      const dy = my - py - motion.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < SNAP_RADIUS) motion.following = true;

      if (motion.following && mx !== IDLE_MOUSE) {
        motion.vx = 0;
        motion.vy = 0;
        motion.x += (mx - px - motion.x) * FOLLOW_EASE;
        motion.y += (my - py - motion.y) * FOLLOW_EASE;
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
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: IDLE_MOUSE, y: IDLE_MOUSE };
    motionRef.current.forEach(m => { m.following = false; });
  }, []);

  const triggerBurst = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const px = rect.left + (p.left / 100) * rect.width;
      const py = rect.top + (p.top / 100) * rect.height;
      const motion = motionRef.current[i];

      const dx = px + motion.x - clientX;
      const dy = py + motion.y - clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (motion.following || dist < SNAP_RADIUS * 1.5) {
        const effectiveDist = motion.following ? 0 : dist;
        const t = 1 - Math.min(effectiveDist, SNAP_RADIUS * 1.5) / (SNAP_RADIUS * 1.5);
        const force = t * BURST_FORCE;
        const angle = dist > 1 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
        motion.following = false;
        motion.vx += Math.cos(angle) * force * 0.07;
        motion.vy += Math.sin(angle) * force * 0.07;
      }
    }
  }, [particles]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    lastWasTouchRef.current = true;
    triggerBurst(touch.clientX, touch.clientY);
  }, [triggerBurst]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (lastWasTouchRef.current) { lastWasTouchRef.current = false; return; }
    triggerBurst(e.clientX, e.clientY);
  }, [triggerBurst]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
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
            ? 'bg-[#38bdf8] text-[#0f1d32] shadow-[0_0_20px_rgba(56,189,248,0.3)] hover:shadow-[0_0_30px_rgba(56,189,248,0.5)] hover:scale-105 cursor-pointer'
            : 'bg-white/5 text-white/20 border border-white/8 cursor-not-allowed'
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
                ? 'bg-[#38bdf8] text-[#0f1d32] shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                : 'bg-white/8 text-white/50 hover:bg-white/12 hover:text-white/70 border border-white/10'
              }
            `}
          >
            {v}
          </button>
        ))}
      </div>

      <style>{`
        .ls-root {
          background: #0f1d32;
          background-image:
            radial-gradient(ellipse 70% 50% at 50% 0%, rgba(56, 189, 248, 0.06) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 80% 100%, rgba(99, 102, 241, 0.04) 0%, transparent 50%);
        }

        .ls-word {
          color: rgba(255, 255, 255, 0.7);
          font-family: "Inter", "SF Pro Text", ui-sans-serif, system-ui, sans-serif;
          font-weight: 650;
          letter-spacing: 0.02em;
          white-space: nowrap;
          will-change: transform;
          transition: none;
        }
        .ls-word-0 { animation: ls-float-drift linear infinite; }
        .ls-word-1 { animation: ls-float-wander linear infinite; }
        .ls-word-2 { animation: ls-float-orbit linear infinite; }

        @keyframes ls-float-drift {
          0%   { transform: translate(calc(0px  + var(--ix)), calc(0px  + var(--iy))) rotate(var(--rotate)); }
          25%  { transform: translate(calc(12px + var(--ix)), calc(-30px + var(--iy))) rotate(calc(var(--rotate) + 5deg)); }
          50%  { transform: translate(calc(-8px + var(--ix)), calc(-15px + var(--iy))) rotate(calc(var(--rotate) - 3deg)); }
          75%  { transform: translate(calc(5px  + var(--ix)), calc(10px  + var(--iy))) rotate(calc(var(--rotate) + 2deg)); }
          100% { transform: translate(calc(0px  + var(--ix)), calc(0px  + var(--iy))) rotate(var(--rotate)); }
        }
        @keyframes ls-float-wander {
          0%   { transform: translate(calc(0px   + var(--ix)), calc(0px  + var(--iy))) rotate(var(--rotate)); }
          33%  { transform: translate(calc(-18px + var(--ix)), calc(8px  + var(--iy))) rotate(calc(var(--rotate) - 6deg)); }
          66%  { transform: translate(calc(10px  + var(--ix)), calc(-20px + var(--iy))) rotate(calc(var(--rotate) + 4deg)); }
          100% { transform: translate(calc(0px   + var(--ix)), calc(0px  + var(--iy))) rotate(var(--rotate)); }
        }
        @keyframes ls-float-orbit {
          0%   { transform: translate(calc(0px   + var(--ix)), calc(0px  + var(--iy))) rotate(var(--rotate)); }
          25%  { transform: translate(calc(15px  + var(--ix)), calc(15px + var(--iy))) rotate(calc(var(--rotate) + 8deg)); }
          50%  { transform: translate(calc(-5px  + var(--ix)), calc(25px + var(--iy))) rotate(calc(var(--rotate) - 4deg)); }
          75%  { transform: translate(calc(-15px + var(--ix)), calc(5px  + var(--iy))) rotate(calc(var(--rotate) + 3deg)); }
          100% { transform: translate(calc(0px   + var(--ix)), calc(0px  + var(--iy))) rotate(var(--rotate)); }
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
        .ls-breathe { animation: ls-opacity-breathe 3s ease-in-out infinite; }
        .ls-underglow {
          position: absolute;
          inset: -20px;
          border-radius: 30%;
          background: radial-gradient(circle, rgba(56, 189, 248, 0.12), transparent 70%);
          animation: ls-glow-pulse 3s ease-in-out infinite;
        }
        @keyframes ls-opacity-breathe {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes ls-glow-pulse {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.6; }
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
          color: rgba(56, 189, 248, 0.85);
          text-shadow: 0 0 10px rgba(56, 189, 248, 0.45);
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
            rgba(56, 189, 248, 0.06) 48%,
            rgba(56, 189, 248, 0.12) 50%,
            rgba(56, 189, 248, 0.06) 52%,
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
          color: rgba(56, 189, 248, 0.8);
          text-shadow: 0 0 6px rgba(56, 189, 248, 0.3);
          white-space: pre;
          user-select: none;
          margin: 0;
        }
        .ls-cursor {
          display: inline-block;
          width: 0.5em;
          height: 1em;
          background: rgba(56, 189, 248, 0.8);
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
          labelClassName="text-white/60 text-[0.62rem] tracking-[0.45em]"
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
            labelClassName="text-white/50 text-[0.65rem] tracking-[0.45em]"
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
        labelClassName="text-white/40 text-[0.58rem] tracking-[0.45em]"
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
        labelClassName="text-white/40 text-[0.58rem] tracking-[0.45em]"
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
