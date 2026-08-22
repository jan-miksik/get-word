'use client';

import { Children, type ReactNode } from 'react';

/**
 * The single top-right lane a card hangs its small controls in — the stage
 * badge, the sound toggle, anything else that belongs in that corner.
 *
 * Only the lane is positioned; its contents are laid out in flow. That is the
 * point: before this, the stage badge pinned itself to `top-5 right-5` and the
 * sound toggle to `top-3 right-3`, so the two silently sat on top of each other
 * on any card that showed both. Controls added here can never overlap, and none
 * of them has to know the pixel offsets of the others.
 */
export function CardTopControls({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  // A card with nothing to show in the corner must not leave an invisible box
  // floating over its content.
  if (Children.toArray(children).length === 0) return null;

  return (
    <div
      className={`pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-2 [&>*]:pointer-events-auto ${className}`}
    >
      {children}
    </div>
  );
}
