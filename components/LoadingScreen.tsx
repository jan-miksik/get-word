'use client';

import { useEffect, useState } from 'react';
import { AppLogo } from '@/components/AppLogo';

const WORDS = [
  'ahoj',
  'xin chào',
  'díky',
  'cảm ơn',
  'dobrý',
  'buổi sáng',
  'jak se máš',
  'bạn khỏe không',
];

// Diacritical characters from Czech + Vietnamese — atmospheric background detail
const GLYPHS = ['č', 'ž', 'š', 'ắ', 'ừ', 'ế', 'ộ', 'ă', 'ổ', 'ý', 'á', 'ú', 'ů', 'ơ', 'ư', 'ề', 'ĕ', 'ř'];

const BG = Array.from({ length: 20 }, (_, i) => ({
  char: GLYPHS[i % GLYPHS.length],
  left: `${(i * 19 + 3) % 98}%`,
  delay: `${(i * 0.6) % 8}s`,
  duration: `${7 + (i * 1.1) % 7}s`,
  size: `${0.75 + (i * 0.18) % 0.9}rem`,
}));

export function LoadingScreen() {
  const [display, setDisplay] = useState('');
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [phase, setPhase] = useState<'typing' | 'hold' | 'deleting'>('typing');

  useEffect(() => {
    const word = WORDS[wordIdx];

    if (phase === 'typing') {
      if (charIdx < word.length) {
        const t = setTimeout(() => {
          setDisplay(word.slice(0, charIdx + 1));
          setCharIdx(c => c + 1);
        }, 105);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase('hold'), 1500);
      return () => clearTimeout(t);
    }

    if (phase === 'hold') {
      const t = setTimeout(() => setPhase('deleting'), 400);
      return () => clearTimeout(t);
    }

    if (phase === 'deleting') {
      if (charIdx > 0) {
        const t = setTimeout(() => {
          setCharIdx(c => c - 1);
          setDisplay(word.slice(0, charIdx - 1));
        }, 60);
        return () => clearTimeout(t);
      }
      setWordIdx(i => (i + 1) % WORDS.length);
      setPhase('typing');
    }
  }, [phase, charIdx, wordIdx]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(circle at top, #225c35 0, #205533 52%, #1e5332 100%)' }}
    >
      {/* Floating glyphs */}
      {BG.map((g, i) => (
        <span
          key={i}
          className="absolute font-mono pointer-events-none select-none text-white"
          style={{
            left: g.left,
            bottom: '-2rem',
            fontSize: g.size,
            opacity: 0.055,
            animation: `ls-float ${g.duration} ${g.delay} ease-in infinite`,
          }}
        >
          {g.char}
        </span>
      ))}

      <AppLogo
        size={78}
        showLabel
        className="mb-10 flex-col gap-4"
        labelClassName="text-white/55 text-[0.68rem] tracking-[0.42em]"
      />

      {/* Typing area */}
      <div className="flex items-center justify-center min-h-[3.5rem]">
        <span
          className="text-white/88 font-mono"
          style={{ fontSize: '2.4rem', letterSpacing: '0.04em' }}
        >
          {display}
        </span>
        <span
          className="inline-block rounded-full ml-[3px]"
          style={{
            width: '2px',
            height: '2.1rem',
            background: '#38bdf8',
            animation: 'ls-blink 1s step-end infinite',
          }}
        />
      </div>

      {/* Three subtle pulse dots */}
      <div className="flex gap-2 mt-14">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="rounded-full bg-white/20"
            style={{
              width: '5px',
              height: '5px',
              animation: 'ls-dot 1.8s ease-in-out infinite',
              animationDelay: `${i * 0.28}s`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes ls-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes ls-dot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.75); }
          40% { opacity: 0.65; transform: scale(1.25); }
        }
        @keyframes ls-float {
          0%   { transform: translateY(0)      rotate(-5deg); opacity: 0.055; }
          85%  { opacity: 0.055; }
          100% { transform: translateY(-105vh) rotate(12deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
