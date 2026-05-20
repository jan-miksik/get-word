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

const SNAP_RADIUS = 120;
const FOLLOW_EASE = 0.18;
const BURST_DECAY = 0.88;
const IDLE_MOUSE = -10000;
const RELEASE_COOLDOWN_MS = 220;

type ParticleMotion = { x: number; y: number; vx: number; vy: number; following: boolean };

export function LoadingScreen() {
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
        <LoaderB />
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
        /* === Loader B === */
        .ls-breathe { opacity: 1; }
        .ls-underglow {
          position: absolute;
          inset: -20px;
          border-radius: 30%;
          background: radial-gradient(circle, rgba(79, 47, 36, 0.1), transparent 70%);
        }
      `}</style>
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
