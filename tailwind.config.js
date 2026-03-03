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
        'deck-exit-slide': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(-110%)', opacity: '0' },
        },
        'deck-exit-flip': {
          '0%': { transform: 'perspective(600px) rotateY(0deg)', opacity: '1' },
          '100%': { transform: 'perspective(600px) rotateY(90deg)', opacity: '0' },
        },
        'deck-exit-scale': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.7)', opacity: '0' },
        },
        'deck-exit-rotate': {
          '0%': { transform: 'rotate(0deg) scale(1)', opacity: '1' },
          '100%': { transform: 'rotate(-8deg) scale(0.85)', opacity: '0' },
        },
        'deck-enter': {
          '0%': { transform: 'translateX(40px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'deck-exit-slide': 'deck-exit-slide 0.3s ease-in forwards',
        'deck-exit-flip': 'deck-exit-flip 0.25s ease-in forwards',
        'deck-exit-scale': 'deck-exit-scale 0.25s ease-in forwards',
        'deck-exit-rotate': 'deck-exit-rotate 0.3s ease-in forwards',
        'deck-enter': 'deck-enter 0.3s ease-out forwards',
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

