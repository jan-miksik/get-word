'use client';

interface SpeckledBackgroundProps {
  className?: string;
}

export function SpeckledBackground({ className = '' }: SpeckledBackgroundProps) {
  const cls = [
    'speckled-background pointer-events-none fixed inset-0 -z-10 h-full w-full max-h-[stretch] max-w-[stretch] bg-[#dcd1b9] object-fill',
    className,
  ].filter(Boolean).join(' ');

  return (
    <img
      aria-hidden="true"
      alt=""
      className={cls}
      src="/backgrounds/bg-get-word.svg"
    />
  );
}
