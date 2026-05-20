'use client';

import { useCallback, useEffect, useState } from 'react';

export type MenuPanel = 'settings' | 'progress' | 'category' | 'memoryHooks';

export function useMenuPanels() {
  const [openPanel, setOpenPanel] = useState<MenuPanel | null>(null);

  const toggle = useCallback((panel: MenuPanel) => {
    setOpenPanel((prev) => (prev === panel ? null : panel));
  }, []);

  const closeAll = useCallback(() => setOpenPanel(null), []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest('.settings-panel') &&
        !target.closest('.progress-panel') &&
        !target.closest('.category-panel') &&
        !target.closest('.memory-hooks-panel') &&
        !target.closest('.top-menu-dropdown') &&
        !target.closest('.menu-dropdown-popup') &&
        !target.closest('.menu-item') &&
        !target.closest('.mode-btn')
      ) {
        setOpenPanel(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openPanel]);

  return {
    settingsOpen: openPanel === 'settings',
    progressOpen: openPanel === 'progress',
    categoryOpen: openPanel === 'category',
    memoryHooksOpen: openPanel === 'memoryHooks',
    toggle,
    closeAll,
  };
}
