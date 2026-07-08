'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface HoldButtonProps {
  /** Fired once the button has been held for the full duration. */
  onConfirm: () => void;
  /** How long the user must hold before confirming. */
  durationMs?: number;
  children: React.ReactNode;
  disabled?: boolean;
  variant?: 'accent' | 'danger' | 'neutral';
  className?: string;
}

const VARIANT_CLASSES: Record<NonNullable<HoldButtonProps['variant']>, string> = {
  accent: 'bg-accent text-white hover:bg-accent/90',
  danger: 'bg-danger text-white hover:bg-danger/90',
  neutral: 'border border-border-subtle text-text hover:bg-background',
};

const RING_RADIUS = 8;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Press-and-hold confirmation button. The user must hold for `durationMs`; a
 * circular ring fills to show progress, and releasing early cancels. Used to
 * guard consequential actions (make public, reset link) without a typed prompt.
 */
export function HoldButton({
  onConfirm,
  durationMs = 2000,
  children,
  disabled = false,
  variant = 'accent',
  className = '',
}: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const doneRef = useRef(false);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      doneRef.current = false;
      startRef.current = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - startRef.current) / durationMs, 1);
        setProgress(p);
        if (p >= 1) {
          doneRef.current = true;
          stop();
          setProgress(0);
          onConfirm();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [disabled, durationMs, onConfirm, stop],
  );

  const cancel = useCallback(() => {
    stop();
    if (!doneRef.current) setProgress(0);
  }, [stop]);

  const holding = progress > 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: 'none' }}
      className={`relative flex select-none items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      <span
        className="relative flex h-4 w-4 shrink-0 items-center justify-center"
        aria-hidden
      >
        {holding ? (
          <svg viewBox="0 0 20 20" className="h-4 w-4 -rotate-90">
            <circle cx="10" cy="10" r={RING_RADIUS} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={2} />
            <circle
              cx="10"
              cy="10"
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <circle cx="10" cy="10" r={RING_RADIUS} stroke="currentColor" strokeOpacity={0.4} strokeWidth={2} />
          </svg>
        )}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}
