'use client';

import type { Tab } from '@/hooks/useAppState';

interface BottomNavProps {
  currentTab: Tab;
  readyCount: number;
  onTabChange: (tab: Tab) => void;
}

export function BottomNav({ currentTab, readyCount, onTabChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="View selection">
      <button
        className={`bottom-nav-btn ${currentTab === 'all' ? 'is-active' : ''}`}
        onClick={() => onTabChange('all')}
        type="button"
      >
        All words
      </button>
      <button
        className={`bottom-nav-btn ${currentTab === 'ready' ? 'is-active' : ''}`}
        onClick={() => onTabChange('ready')}
        type="button"
        data-tab="ready"
        data-count={readyCount > 0 ? readyCount : ''}
      >
        Ready to repeat
      </button>
    </nav>
  );
}
