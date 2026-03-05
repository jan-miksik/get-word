/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
    './data/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#050816',
        'background-elevated': '#0b1220',
        accent: '#38bdf8',
        'accent-soft': 'rgba(56, 189, 248, 0.12)',
        'accent-strong': 'rgba(56, 189, 248, 0.32)',
        text: '#e5e7eb',
        'text-soft': '#9ca3af',
        'border-subtle': 'rgba(148, 163, 184, 0.35)',
        danger: '#fb7185',
      },
      borderRadius: {
        lg: '18px',
        pill: '999px',
      },
      boxShadow: {
        soft: '0 18px 45px rgba(15, 23, 42, 0.75)',
        chip: '0 10px 25px rgba(15, 23, 42, 0.7)',
      },
      transitionTimingFunction: {
        fast: 'cubic-bezier(0.4, 0, 0.2, 1)',
        med: 'ease',
      },
      keyframes: {
        // ── Exit animations ──
        'deck-exit-slide': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(-115%)', opacity: '0' },
        },
        'deck-exit-swipe-up': {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(-130%) rotate(4deg)', opacity: '0' },
        },
        'deck-exit-flip': {
          '0%': { transform: 'perspective(700px) rotateY(0deg)', opacity: '1' },
          '100%': { transform: 'perspective(700px) rotateY(100deg)', opacity: '0' },
        },
        'deck-exit-scale': {
          '0%': { transform: 'scale(1) translateY(0)', opacity: '1' },
          '100%': { transform: 'scale(0.6) translateY(-16px)', opacity: '0' },
        },
        'deck-exit-rotate': {
          '0%': { transform: 'rotate(0deg) scale(1) translateY(0)', opacity: '1' },
          '100%': { transform: 'rotate(-18deg) scale(0.65) translateY(28px)', opacity: '0' },
        },
        'deck-exit-dissolve': {
          '0%': { transform: 'scale(1)', opacity: '1', filter: 'blur(0px)' },
          '100%': { transform: 'scale(1.1)', opacity: '0', filter: 'blur(10px)' },
        },
        // ── Enter animations ──
        'deck-enter-slide': {
          '0%': { transform: 'translateX(50px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'deck-enter-rise': {
          '0%': { transform: 'translateY(40px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'deck-enter-pop': {
          '0%': { transform: 'scale(0.78)', opacity: '0' },
          '65%': { transform: 'scale(1.04)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'deck-enter-drop': {
          '0%': { transform: 'translateY(-44px)', opacity: '0' },
          '65%': { transform: 'translateY(6px)', opacity: '1' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'deck-exit-slide': 'deck-exit-slide 0.28s cubic-bezier(0.4,0,1,1) forwards',
        'deck-exit-swipe-up': 'deck-exit-swipe-up 0.28s cubic-bezier(0.4,0,1,1) forwards',
        'deck-exit-flip': 'deck-exit-flip 0.24s cubic-bezier(0.4,0,1,1) forwards',
        'deck-exit-scale': 'deck-exit-scale 0.26s cubic-bezier(0.4,0,1,1) forwards',
        'deck-exit-rotate': 'deck-exit-rotate 0.3s cubic-bezier(0.4,0,1,1) forwards',
        'deck-exit-dissolve': 'deck-exit-dissolve 0.3s ease-in forwards',
        'deck-enter-slide': 'deck-enter-slide 0.32s cubic-bezier(0,0,0.2,1) forwards',
        'deck-enter-rise': 'deck-enter-rise 0.32s cubic-bezier(0,0,0.2,1) forwards',
        'deck-enter-pop': 'deck-enter-pop 0.38s cubic-bezier(0.34,1.56,0.64,1) forwards',
        'deck-enter-drop': 'deck-enter-drop 0.38s cubic-bezier(0.34,1.56,0.64,1) forwards',
      },
    },
  },
  safelist: [
    'scale-95',
    'opacity-90',
    'shadow-md',
    'ring-1',
    'ring-slate-700',
    'ring-offset-2',
    'ring-offset-slate-900',
  ],
  plugins: [],
};

