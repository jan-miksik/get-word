'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KebabIcon } from '@/components/icons/AppIcons';

/**
 * The add-words screen's overflow menu, sitting beside the study pair in the
 * header — the same spot on every tab, so switching between typing, a photo and
 * the conversation never moves the controls around.
 *
 * Everything it holds — the settings, pasting a prepared batch, handing the list
 * out — is an occasional errand. As buttons on the step itself they competed for
 * attention with the one thing the step is for: getting a word onto the list.
 */
export function HeadingMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="onboarding-option-secondary flex h-8 w-8 items-center justify-center rounded-full"
      >
        <KebabIcon size={16} />
      </button>
      {open ? (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="onboarding-combobox-list absolute right-0 z-30 mt-1 w-60 max-w-[calc(100vw-2rem)] overflow-hidden p-1"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function HeadingMenuItem({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="onboarding-combobox-option flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-bold"
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="min-w-0">{children}</span>
    </button>
  );
}
