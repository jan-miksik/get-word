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
import { PWAInstallBanner } from '@/components/PWAInstallBanner';
import { SpeckledBackground } from '@/components/SpeckledBackground';
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
  onSignOut?: () => void | Promise<void>;
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
      <SpeckledBackground />
      {header}
      <header className="app-header-bar" aria-label="App header">
        <TopMenu
          showAll={showAll}
          onShowAll={() => setShowAll(!showAll)}
          onMenuAction={toggle}
          categoryCount={selectedCategories.size}
          categoryActive={categories.length > 0 && selectedCategories.size < categories.length}
          progressActive={progressOpen}
          score={gameScore}
          lists={subscribedLists.length > 0 ? subscribedLists : undefined}
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
                  <div className="flex items-center gap-2">
                    <AuthButton
                      isAuthenticated
                      authEmail={authEmail}
                      authAddress={authAddress}
                    />
                    {onSignOut && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void onSignOut();
                        }}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-background-elevated border border-border-subtle text-text-soft hover:text-text hover:bg-background transition-colors"
                        aria-label="Sign out"
                        title="Sign out"
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                        >
                          <path
                            d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M15 12H3m0 0 3-3m-3 3 3 3"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
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

      <PWAInstallBanner />
      {children}
    </div>
  );
}
