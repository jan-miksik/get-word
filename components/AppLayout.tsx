'use client';

import { ReactNode } from 'react';
import { TopMenu } from '@/components/TopMenu';
import { AuthButton } from '@/components/AuthButton';
import { SettingsPanel } from '@/components/SettingsPanel';
import { CategoryPanel } from '@/components/CategoryPanel';
import { MemoryHooksPanel } from '@/components/MemoryHooksPanel';
import { ProgressPanel } from '@/components/ProgressPanel';
import { ProgressSummary } from '@/components/ProgressSummary';
import { useMenuPanels } from '@/hooks/useMenuPanels';
import { useAppStateContext } from '@/context/AppStateContext';
import type { ProgressStats } from '@/lib/progress-stats';

interface AppLayoutProps {
  // Page-level UI state (localStorage-only, not in context)
  viewMode: 'card' | 'stream';
  onViewModeChange: (mode: 'card' | 'stream') => void;
  minigameFrequency: import('@/lib/minigames').MinigameFrequencyRange;
  onMinigameFrequencyChange: (value: import('@/lib/minigames').MinigameFrequencyRange) => void;
  // Auth (from useAuth, not useAppState)
  isAuthenticated?: boolean;
  authEmail?: string;
  authAddress?: string;
  onSignOut?: () => void;
  // Page-computed values (differ between main and edit page)
  categories: Array<{ name: string; count: number }>;
  progressStats: ProgressStats;
  // Layout
  header?: ReactNode;
  children: ReactNode;
}

export function AppLayout({
  viewMode,
  onViewModeChange,
  minigameFrequency,
  onMinigameFrequencyChange,
  isAuthenticated,
  authEmail,
  authAddress,
  onSignOut,
  categories,
  progressStats,
  header,
  children,
}: AppLayoutProps) {
  const { settingsOpen, progressOpen, categoryOpen, memoryHooksOpen, toggle, closeAll } =
    useMenuPanels();

  const { showAll, setShowAll, selectedCategories, gameScore, subscribedLists, activeListId, setActiveListId } = useAppStateContext();

  return (
    <div className="app" data-view-mode={viewMode}>
      {header}
      <header className="app-header-bar" aria-label="App header">
        <TopMenu
          showAll={showAll}
          onShowAll={() => setShowAll(!showAll)}
          onMenuAction={toggle}
          categoryCount={selectedCategories.size}
          categoryActive={selectedCategories.size > 0}
          progressActive={progressOpen}
          score={gameScore}
          lists={subscribedLists.length > 1 ? subscribedLists : undefined}
          activeListId={activeListId}
          onListChange={setActiveListId}
          centerContent={
            isAuthenticated
              ? <ProgressSummary progressStats={progressStats} />
              : (
                  <div className="flex justify-center">
                    <AuthButton
                      size="large"
                      isAuthenticated={false}
                      authEmail={authEmail}
                      authAddress={authAddress}
                    />
                  </div>
                )
          }
          accountSlot={
            isAuthenticated
              ? (
                  <AuthButton
                    isAuthenticated
                    authEmail={authEmail}
                    authAddress={authAddress}
                  />
                )
              : undefined
          }
          hideMonkeyOnMobile={viewMode === 'card'}
        />
      </header>
      <SettingsPanel
        minigameFrequency={minigameFrequency}
        onMinigameFrequencyChange={onMinigameFrequencyChange}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        isOpen={settingsOpen}
        onClose={closeAll}
        isAuthenticated={isAuthenticated}
        authEmail={authEmail}
        authAddress={authAddress}
        onSignOut={onSignOut}
      />
      <CategoryPanel
        isOpen={categoryOpen}
        categories={categories}
        onClose={closeAll}
      />
      <MemoryHooksPanel
        isOpen={memoryHooksOpen}
        onClose={closeAll}
      />
      <ProgressPanel
        isOpen={progressOpen}
        progressStats={progressStats}
        onClose={closeAll}
      />

      {children}
    </div>
  );
}
