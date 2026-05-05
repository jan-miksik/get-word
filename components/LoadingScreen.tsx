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

const LOADING_WORDS = [
  'loading',
  'cargando',
  'chargement',
  'laden',
  'caricando',
  'načítání',
  'ładowanie',
  '加载中',
  '読み込み中',
  '로딩 중',
  'загрузка',
  'تحميل',
  'cargando',
  'yükleniyor',
  'memuat',
  'đang tải',
  'กำลังโหลด',
  'लोड हो रहा है',
];

const PARTICLE_COUNT = 34;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const s1 = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  const s2 = Math.sin(i * 269.5 + 183.3) * 28461.2731;
  const s3 = Math.sin(i * 421.7 + 91.9) * 14687.229;
  const p1 = s1 - Math.floor(s1);
  const p2 = s2 - Math.floor(s2);
  const p3 = s3 - Math.floor(s3);

  const animType = i % 3;

  return {
    word: LOADING_WORDS[Math.floor(p3 * LOADING_WORDS.length)],
    left: p1 * 92 + 4,
    top: p2 * 90 + 5,
    delay: `${-(p1 * 10).toFixed(2)}s`,
    duration: `${(12 + p2 * 14).toFixed(3)}s`,
    size: `${(0.58 + p3 * 1.45).toFixed(3)}rem`,
    opacity: (0.06 + p2 * 0.14).toFixed(3),
    animType,
    rotate: Math.floor(p1 * 32 - 16),
  };
});

const CONSTELLATION_COUNT = 28;
const CONSTELLATION = Array.from({ length: CONSTELLATION_COUNT }, (_, i) => {
  const angle = i * 0.85 + 0.2;
  const radius = 20 + i * 4.2;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  const s = Math.sin(i * 73.1 + 17.3) * 9827.31;
  const p = s - Math.floor(s);
  const glyphIdx = Math.floor(p * GLYPHS.length);

  return {
    char: GLYPHS[glyphIdx],
    x,
    y,
    delay: `${(i * 0.12).toFixed(2)}s`,
    size: `${0.65 + p * 0.55}rem`,
  };
});

type LoaderVariant = 'A' | 'B' | 'C';

interface LoadingScreenProps {
  ready?: boolean;
  onContinue?: () => void;
}

const SNAP_RADIUS = 120;
const FOLLOW_EASE = 0.18;
const BURST_FORCE = 280;
const BURST_DECAY = 0.9;
const IDLE_MOUSE = -10000;

type ParticleMotion = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  following: boolean;
};

export function LoadingScreen({ ready, onContinue }: LoadingScreenProps) {
  const [variant, setVariant] = useState<LoaderVariant>('A');
  const containerRef = useRef<HTMLDivElement>(null);
  const particleRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const mouseRef = useRef({ x: IDLE_MOUSE, y: IDLE_MOUSE });
  const motionRef = useRef<ParticleMotion[]>(
    PARTICLES.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, following: false }))
  );
  const rafRef = useRef<number>(0);

  const animate = useCallback(() => {
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;
    const container = containerRef.current;
    if (!container) {
      rafRef.current = requestAnimationFrame(animate);
      return;
    }

    const rect = container.getBoundingClientRect();

    for (let i = 0; i < PARTICLES.length; i++) {
      const el = particleRefs.current[i];
      if (!el) continue;

      const p = PARTICLES[i];
      const px = rect.left + (p.left / 100) * rect.width;
      const py = rect.top + (p.top / 100) * rect.height;

      const motion = motionRef.current[i];
      const dx = mx - px - motion.x;
      const dy = my - py - motion.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < SNAP_RADIUS) {
        motion.following = true;
      }

      if (motion.following && mx !== IDLE_MOUSE) {
        const targetX = mx - px;
        const targetY = my - py;
        motion.vx = 0;
        motion.vy = 0;
        motion.x += (targetX - motion.x) * FOLLOW_EASE;
        motion.y += (targetY - motion.y) * FOLLOW_EASE;
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
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: IDLE_MOUSE, y: IDLE_MOUSE };
    motionRef.current.forEach((motion) => {
      motion.following = false;
    });
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    for (let i = 0; i < PARTICLES.length; i++) {
      const p = PARTICLES[i];
      const px = rect.left + (p.left / 100) * rect.width;
      const py = rect.top + (p.top / 100) * rect.height;
      const motion = motionRef.current[i];

      const dx = px + motion.x - e.clientX;
      const dy = py + motion.y - e.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (motion.following || dist < SNAP_RADIUS * 1.5) {
        const force = (1 - Math.min(dist, SNAP_RADIUS * 1.5) / (SNAP_RADIUS * 1.5)) * BURST_FORCE;
        const angle = dist > 0 ? Math.atan2(dy, dx) : Math.sin(i * 12.9898) * Math.PI * 2;
        motion.following = false;
        motion.vx += Math.cos(angle) * force * 0.07;
        motion.vy += Math.sin(angle) * force * 0.07;
      }
    }
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden ls-root"
    >
      {/* Floating loading words scattered across the viewport */}
      {PARTICLES.map((p, i) => (
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
          {p.word}
        </span>
      ))}

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center">
        {variant === 'A' && <LoaderA />}
        {variant === 'B' && <LoaderB />}
        {variant === 'C' && <LoaderC />}
      </div>

      {/* Continue button */}
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

      {/* Variant switcher — temporary */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex gap-2">
        {(['A', 'B', 'C'] as const).map(v => (
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
          text-transform: lowercase;
          will-change: transform;
          transition: none;
        }

        .ls-word-0 {
          animation: ls-float-drift linear infinite;
        }
        .ls-word-1 {
          animation: ls-float-wander linear infinite;
        }
        .ls-word-2 {
          animation: ls-float-orbit linear infinite;
        }

        @keyframes ls-float-drift {
          0% { transform: translate(calc(0px + var(--ix)), calc(0px + var(--iy))) rotate(var(--rotate)); }
          25% { transform: translate(calc(12px + var(--ix)), calc(-30px + var(--iy))) rotate(calc(var(--rotate) + 5deg)); }
          50% { transform: translate(calc(-8px + var(--ix)), calc(-15px + var(--iy))) rotate(calc(var(--rotate) - 3deg)); }
          75% { transform: translate(calc(5px + var(--ix)), calc(10px + var(--iy))) rotate(calc(var(--rotate) + 2deg)); }
          100% { transform: translate(calc(0px + var(--ix)), calc(0px + var(--iy))) rotate(var(--rotate)); }
        }

        @keyframes ls-float-wander {
          0% { transform: translate(calc(0px + var(--ix)), calc(0px + var(--iy))) rotate(var(--rotate)); }
          33% { transform: translate(calc(-18px + var(--ix)), calc(8px + var(--iy))) rotate(calc(var(--rotate) - 6deg)); }
          66% { transform: translate(calc(10px + var(--ix)), calc(-20px + var(--iy))) rotate(calc(var(--rotate) + 4deg)); }
          100% { transform: translate(calc(0px + var(--ix)), calc(0px + var(--iy))) rotate(var(--rotate)); }
        }

        @keyframes ls-float-orbit {
          0% { transform: translate(calc(0px + var(--ix)), calc(0px + var(--iy))) rotate(var(--rotate)); }
          25% { transform: translate(calc(15px + var(--ix)), calc(15px + var(--iy))) rotate(calc(var(--rotate) + 8deg)); }
          50% { transform: translate(calc(-5px + var(--ix)), calc(25px + var(--iy))) rotate(calc(var(--rotate) - 4deg)); }
          75% { transform: translate(calc(-15px + var(--ix)), calc(5px + var(--iy))) rotate(calc(var(--rotate) + 3deg)); }
          100% { transform: translate(calc(0px + var(--ix)), calc(0px + var(--iy))) rotate(var(--rotate)); }
        }

        /* === Loader A: Dynamic fog with logo centered === */
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
          border-radius: 50%;
          filter: blur(30px);
          will-change: transform, border-radius;
        }
        .ls-fog-1 {
          inset: -10px;
          background: rgba(56, 189, 248, 0.18);
          animation: ls-squeeze-1 4.7s cubic-bezier(.45, 0, .35, 1) infinite;
        }
        .ls-fog-2 {
          inset: 5px;
          background: rgba(99, 102, 241, 0.12);
          animation: ls-squeeze-2 6.4s cubic-bezier(.42, 0, .32, 1) infinite;
        }
        .ls-fog-3 {
          inset: -20px;
          background: rgba(56, 189, 248, 0.09);
          animation: ls-squeeze-3 8.1s cubic-bezier(.4, 0, .3, 1) infinite;
        }
        .ls-fog-4 {
          inset: 15px;
          background: rgba(167, 139, 250, 0.08);
          animation: ls-squeeze-4 5.2s cubic-bezier(.5, 0, .25, 1) infinite;
        }

        @keyframes ls-squeeze-1 {
          0%, 100% { border-radius: 50%; transform: translate(0, 0) scale(1, 1) rotate(0deg); }
          14% { border-radius: 62% 38% 54% 46% / 42% 58% 37% 63%; transform: translate(13px, -9px) scale(1.18, 0.82) rotate(4deg); }
          31% { border-radius: 43% 57% 39% 61% / 59% 41% 65% 35%; transform: translate(-11px, 7px) scale(0.86, 1.13) rotate(-6deg); }
          53% { border-radius: 57% 43% 64% 36% / 47% 53% 42% 58%; transform: translate(8px, 12px) scale(1.1, 0.92) rotate(3deg); }
          77% { border-radius: 39% 61% 48% 52% / 64% 36% 57% 43%; transform: translate(-6px, -5px) scale(0.94, 1.08) rotate(-2deg); }
        }

        @keyframes ls-squeeze-2 {
          0%, 100% { border-radius: 50%; transform: translate(0, 0) scale(1, 1) rotate(0deg); }
          18% { border-radius: 47% 53% 63% 37% / 57% 43% 38% 62%; transform: translate(-9px, 6px) scale(0.82, 1.18) rotate(7deg); }
          39% { border-radius: 65% 35% 43% 57% / 37% 63% 59% 41%; transform: translate(14px, 3px) scale(1.17, 0.83) rotate(-5deg); }
          68% { border-radius: 52% 48% 58% 42% / 42% 58% 51% 49%; transform: translate(-3px, -13px) scale(0.93, 1.08) rotate(5deg); }
          86% { border-radius: 42% 58% 51% 49% / 61% 39% 44% 56%; transform: translate(5px, 9px) scale(1.06, 0.96) rotate(-3deg); }
        }

        @keyframes ls-squeeze-3 {
          0%, 100% { border-radius: 50%; transform: translate(0, 0) scale(1, 1) rotate(0deg); }
          22% { border-radius: 58% 42% 37% 63% / 63% 37% 53% 47%; transform: translate(10px, 10px) scale(1.09, 0.86) rotate(-5deg); }
          46% { border-radius: 36% 64% 57% 43% / 44% 56% 35% 65%; transform: translate(-15px, -4px) scale(0.83, 1.16) rotate(8deg); }
          73% { border-radius: 63% 37% 52% 48% / 48% 52% 64% 36%; transform: translate(4px, -12px) scale(1.07, 0.95) rotate(-3deg); }
          91% { border-radius: 49% 51% 61% 39% / 56% 44% 48% 52%; transform: translate(-6px, 4px) scale(0.96, 1.03) rotate(2deg); }
        }

        @keyframes ls-squeeze-4 {
          0%, 100% { border-radius: 50%; transform: translate(0, 0) scale(1, 1) rotate(0deg); }
          27% { border-radius: 38% 62% 64% 36% / 64% 36% 39% 61%; transform: translate(12px, -7px) scale(1.22, 0.78) rotate(9deg); }
          58% { border-radius: 66% 34% 38% 62% / 35% 65% 63% 37%; transform: translate(-10px, 11px) scale(0.78, 1.22) rotate(-7deg); }
          81% { border-radius: 46% 54% 56% 44% / 59% 41% 47% 53%; transform: translate(3px, -14px) scale(1.08, 0.91) rotate(4deg); }
        }

        /* === Loader B: Pure opacity breathe === */
        .ls-breathe {
          animation: ls-opacity-breathe 3s ease-in-out infinite;
        }
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

        /* === Loader C: Constellation spiral === */
        .ls-constellation {
          position: relative;
          width: 260px;
          height: 260px;
          animation: ls-constellation-rotate 40s linear infinite;
        }
        .ls-star {
          position: absolute;
          top: 50%;
          left: 50%;
          color: rgba(56, 189, 248, 0.7);
          font-family: "SF Mono", "Fira Code", "JetBrains Mono", ui-monospace, monospace;
          animation: ls-twinkle 2.5s ease-in-out infinite;
        }
        .ls-star-line {
          position: absolute;
          top: 50%;
          left: 50%;
          height: 1px;
          background: linear-gradient(90deg, rgba(56, 189, 248, 0.15), transparent);
          transform-origin: left center;
          animation: ls-line-fade 3s ease-in-out infinite;
        }

        @keyframes ls-constellation-rotate {
          to { transform: rotate(360deg); }
        }
        @keyframes ls-twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes ls-line-fade {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

function LoaderA() {
  return (
    <div className="ls-fog-wrap">
      <div className="ls-fog ls-fog-1" />
      <div className="ls-fog ls-fog-2" />
      <div className="ls-fog ls-fog-3" />
      <div className="ls-fog ls-fog-4" />
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
    <div className="flex flex-col items-center gap-6">
      <AppLogo
        size={56}
        showLabel
        className="flex-col gap-3"
        labelClassName="text-white/50 text-[0.6rem] tracking-[0.45em]"
      />
      <div className="ls-constellation">
        {CONSTELLATION.map((star, i) => {
          if (i === 0) return null;
          const prev = CONSTELLATION[i - 1];
          const dx = star.x - prev.x;
          const dy = star.y - prev.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <div
              key={`line-${i}`}
              className="ls-star-line"
              style={{
                width: `${length}px`,
                transform: `translate(${prev.x}px, ${prev.y}px) rotate(${angle}deg)`,
                animationDelay: `${(i * 0.1).toFixed(2)}s`,
              }}
            />
          );
        })}
        {CONSTELLATION.map((star, i) => (
          <span
            key={i}
            className="ls-star"
            style={{
              transform: `translate(${star.x}px, ${star.y}px)`,
              fontSize: star.size,
              animationDelay: star.delay,
            }}
          >
            {star.char}
          </span>
        ))}
      </div>
    </div>
  );
}
