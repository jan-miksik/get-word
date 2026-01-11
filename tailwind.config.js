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

