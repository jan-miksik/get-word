'use client';

interface BottomNavProps {
  readyCount: number;
}

export function BottomNav({ readyCount }: BottomNavProps) {
  if (readyCount === 0) return null;

  return (
    <nav className="bottom-nav" aria-label="Repeat status">
      <div className="flex items-center justify-center gap-1.5 text-sm text-text-soft">
        <span className="w-1.5 h-1.5 rounded-full bg-accent opacity-80 animate-[countdown-pulse_1.8s_ease-in-out_infinite]" />
        <span>{readyCount} ready to repeat</span>
      </div>
    </nav>
  );
}
