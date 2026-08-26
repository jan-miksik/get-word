'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OPEN_MEMORY_HOOKS_PANEL_EVENT } from '@/lib/ui-events';

export type MenuPanel = 'settings' | 'learning' | 'category' | 'memoryHooks' | 'upcoming';

/**
 * A request to open a panel *at* something, not merely to open it.
 *
 * Panels stay mounted, so their internal state survives being closed — a
 * collapsed section stays collapsed the next time round. An `initiallyExpanded`
 * prop would therefore only ever work on the first mount. The monotonic
 * `requestId` is what makes the request fire every single time instead.
 */
export interface PanelOpenRequest {
  panel: MenuPanel;
  section: string | null;
  requestId: number;
}

export function useMenuPanels() {
  const [openPanel, setOpenPanel] = useState<MenuPanel | null>(null);
  const [openRequest, setOpenRequest] = useState<PanelOpenRequest | null>(null);
  const requestIdRef = useRef(0);
  const ignoreNextDocumentClickRef = useRef(false);

  const toggle = useCallback((panel: MenuPanel) => {
    setOpenPanel((prev) => (prev === panel ? null : panel));
  }, []);

  /** Opens a panel outright — and, with `section`, asks it to reveal that part. */
  const open = useCallback((panel: MenuPanel, options?: { section?: string }) => {
    // The click that opened the panel is still on its way to the document
    // handler below, which would read it as a click outside and close again.
    ignoreNextDocumentClickRef.current = true;
    requestIdRef.current += 1;
    setOpenRequest({ panel, section: options?.section ?? null, requestId: requestIdRef.current });
    setOpenPanel(panel);
  }, []);

  const closeAll = useCallback(() => setOpenPanel(null), []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ignoreNextDocumentClickRef.current) {
        ignoreNextDocumentClickRef.current = false;
        return;
      }
      const target = e.target as HTMLElement;
      if (
        !target.closest('.settings-panel') &&
        !target.closest('.learning-settings-panel') &&
        !target.closest('.category-panel') &&
        !target.closest('.memory-hooks-panel') &&
        !target.closest('.upcoming-panel') &&
        !target.closest('.top-menu-dropdown') &&
        !target.closest('.menu-dropdown-popup') &&
        !target.closest('.menu-item') &&
        !target.closest('[data-memory-hooks-learn-more]') &&
        !target.closest('.mode-btn')
      ) {
        setOpenPanel(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openPanel]);

  useEffect(() => {
    const handleOpenMemoryHooksPanel = () => {
      ignoreNextDocumentClickRef.current = true;
      setOpenPanel('memoryHooks');
    };
    window.addEventListener(OPEN_MEMORY_HOOKS_PANEL_EVENT, handleOpenMemoryHooksPanel);
    return () => {
      window.removeEventListener(OPEN_MEMORY_HOOKS_PANEL_EVENT, handleOpenMemoryHooksPanel);
    };
  }, []);

  return {
    settingsOpen: openPanel === 'settings',
    learningOpen: openPanel === 'learning',
    categoryOpen: openPanel === 'category',
    memoryHooksOpen: openPanel === 'memoryHooks',
    upcomingOpen: openPanel === 'upcoming',
    openRequest,
    toggle,
    open,
    closeAll,
  };
}
