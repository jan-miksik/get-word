'use client';

import { MouseEvent } from 'react';
import { AuthButton } from '@/components/AuthButton';

interface TopMenuProps {
  onSwitch: (e: MouseEvent) => void;
  onShowAll: (e: MouseEvent) => void;
  onCategory: (e: MouseEvent) => void;
  onProgress: (e: MouseEvent) => void;
  onMemoryHooks: (e: MouseEvent) => void;
  onSettings: (e: MouseEvent) => void;
  showAll: boolean;
  categoryCount: number;
  categoryActive: boolean;
  progressActive: boolean;
  readyCount?: number;
  showWaitingForRepeat?: boolean;
  onToggleWaitingForRepeat?: (e: MouseEvent) => void;
  currentTab?: 'all' | 'ready';
}

export function TopMenu({
  onSwitch,
  onShowAll,
  onCategory,
  onProgress,
  onMemoryHooks,
  onSettings,
  showAll,
  categoryCount,
  categoryActive,
  progressActive,
}: TopMenuProps) {
  return (
    <div className="top-menu" aria-label="Top menu">
      <div className="flex flex-wrap items-center gap-2">
        <button className="mode-btn switch-btn" onClick={onSwitch} type="button" aria-label="Switch mode">
          🔄
        </button>
        <button className="mode-btn show-all-btn" onClick={onShowAll} type="button" aria-label={showAll ? "Hide completed items" : "Show all items"}>
          {showAll ? '🙉' : '🙈'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 ml-auto">
        <button
          className={`mode-btn category-btn ${categoryActive ? 'is-active' : ''}`}
          onClick={onCategory}
          type="button"
          aria-label="Filter by category"
          data-count={categoryCount > 0 ? categoryCount : ''}
        >
          🏷️
        </button>
        <button
          className={`mode-btn progress-btn ${progressActive ? 'is-active' : ''}`}
          onClick={onProgress}
          type="button"
          aria-label="View progress"
        >
          📊
        </button>
        <button
          className="mode-btn memory-hooks-btn"
          onClick={onMemoryHooks}
          type="button"
          aria-label="Memory Hooks Info"
        >
          ℹ️
        </button>
        <AuthButton />
        <button className="mode-btn settings-btn" onClick={onSettings} type="button">
          Settings
        </button>
      </div>
    </div>
  );
}

