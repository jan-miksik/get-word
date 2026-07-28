'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { AppSurface } from './surface-history';

type Props = {
  surface: AppSurface;
  active: boolean;
  label: string;
  className?: string;
  children: ReactNode;
  panelRef?: (node: HTMLElement | null) => void;
};

export function AppSurfacePanel({
  surface,
  active,
  label,
  className = '',
  children,
  panelRef,
}: Props) {
  const elementRef = useRef<HTMLElement | null>(null);
  const savedScrollTopRef = useRef(0);
  const previousActiveRef = useRef(active);
  const mountedRef = useRef(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (active && surface !== 'study') {
        const frame = window.requestAnimationFrame(() => {
          element.focus({ preventScroll: true });
        });
        return () => window.cancelAnimationFrame(frame);
      }
      return;
    }
    const wasActive = previousActiveRef.current;
    previousActiveRef.current = active;
    if (wasActive && !active) {
      savedScrollTopRef.current = element.scrollTop;
      return;
    }
    if (!wasActive && active) {
      const frame = window.requestAnimationFrame(() => {
        element.scrollTop = savedScrollTopRef.current;
        element.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [active, surface]);

  return (
    <section
      ref={(node) => {
        elementRef.current = node;
        panelRef?.(node);
      }}
      data-app-surface={surface}
      aria-label={label}
      hidden={!active}
      inert={!active}
      tabIndex={-1}
      className={`${active ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden outline-none ${className}`}
    >
      {children}
    </section>
  );
}
