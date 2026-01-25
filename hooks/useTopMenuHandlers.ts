'use client';

import { useCallback } from 'react';
import type { Role, Tab } from './useAppState';

interface UseTopMenuHandlersProps {
  modeIndex: number;
  setModeIndex: (index: number) => void;
  showAll: boolean;
  setShowAll: (show: boolean) => void;
  categoryOpen: boolean;
  setCategoryOpen: (open: boolean) => void;
  progressOpen: boolean;
  setProgressOpen: (open: boolean) => void;
  memoryHooksOpen: boolean;
  setMemoryHooksOpen: (open: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  closeAllPanels: () => void;
  selectedCategories: Set<string>;
}

export function useTopMenuHandlers({
  modeIndex,
  setModeIndex,
  showAll,
  setShowAll,
  categoryOpen,
  setCategoryOpen,
  progressOpen,
  setProgressOpen,
  memoryHooksOpen,
  setMemoryHooksOpen,
  settingsOpen,
  setSettingsOpen,
  closeAllPanels,
  selectedCategories,
}: UseTopMenuHandlersProps) {
  const handleSwitch = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setModeIndex(modeIndex === 0 ? 1 : 0);
  }, [modeIndex, setModeIndex]);

  const handleShowAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAll(!showAll);
  }, [showAll, setShowAll]);

  const handleCategory = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const wasOpen = categoryOpen;
    closeAllPanels();
    if (!wasOpen) setCategoryOpen(true);
  }, [categoryOpen, setCategoryOpen, closeAllPanels]);

  const handleProgress = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const wasOpen = progressOpen;
    closeAllPanels();
    if (!wasOpen) setProgressOpen(true);
  }, [progressOpen, setProgressOpen, closeAllPanels]);

  const handleMemoryHooks = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const wasOpen = memoryHooksOpen;
    closeAllPanels();
    if (!wasOpen) setMemoryHooksOpen(true);
  }, [memoryHooksOpen, setMemoryHooksOpen, closeAllPanels]);

  const handleSettings = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const wasOpen = settingsOpen;
    closeAllPanels();
    if (!wasOpen) setSettingsOpen(true);
  }, [settingsOpen, setSettingsOpen, closeAllPanels]);

  return {
    onSwitch: handleSwitch,
    onShowAll: handleShowAll,
    onCategory: handleCategory,
    onProgress: handleProgress,
    onMemoryHooks: handleMemoryHooks,
    onSettings: handleSettings,
    showAll,
    categoryCount: selectedCategories.size,
    categoryActive: selectedCategories.size > 0,
    progressActive: progressOpen,
  };
}
