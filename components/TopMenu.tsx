'use client';

import { MouseEvent } from 'react';

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
      <div className="top-menu-left">
        <button className="mode-btn switch-btn" onClick={onSwitch} type="button">
          🔄
        </button>
        <button className="mode-btn show-all-btn" onClick={onShowAll} type="button">
          {showAll ? '🙉' : '🙈'}
        </button>
        <button
          className={`mode-btn category-btn ${categoryActive ? 'is-active' : ''}`}
          onClick={onCategory}
          type="button"
          title="Filter by category"
          data-count={categoryCount > 0 ? categoryCount : ''}
        >
          🏷️
        </button>
        <button
          className={`mode-btn progress-btn ${progressActive ? 'is-active' : ''}`}
          onClick={onProgress}
          type="button"
        >
          📊
        </button>
      </div>
      <div className="top-menu-right">
        <button
          className="mode-btn memory-hooks-btn"
          onClick={onMemoryHooks}
          type="button"
          title="Memory Hooks Info"
        >
          ℹ️
        </button>
        <button className="mode-btn settings-btn" onClick={onSettings} type="button">
          Settings
        </button>
      </div>
    </div>
  );
}

