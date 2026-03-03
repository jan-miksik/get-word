'use client';

import { ReactNode } from 'react';
import { TopMenu } from '@/components/TopMenu';
import { AuthButton } from '@/components/AuthButton';
import { SettingsPanel } from '@/components/SettingsPanel';
import { CategoryPanel } from '@/components/CategoryPanel';
import { MemoryHooksPanel } from '@/components/MemoryHooksPanel';
import { ProgressPanel } from '@/components/ProgressPanel';
import { ProgressSummary } from '@/components/ProgressSummary';
import { ScoreBadge } from '@/components/TopMenu';
import type { Role, Theme } from '@/hooks/useAppState';
import type { ProgressStats } from '@/lib/progress-stats';

interface AppLayoutProps {
  // TopMenu props
  topMenuHandlers: {
    onShowAll: (e: React.MouseEvent) => void;
    onCategory: (e: React.MouseEvent) => void;
    onProgress: (e: React.MouseEvent) => void;
    onMemoryHooks: (e: React.MouseEvent) => void;
    onSettings: (e: React.MouseEvent) => void;
    showAll: boolean;
    categoryCount: number;
    categoryActive: boolean;
    progressActive: boolean;
  };
  // SettingsPanel props
  role: Role;
  onRoleChange: (role: Role) => void;
  showEnglish: boolean;
  onShowEnglishChange: (show: boolean) => void;
  showCategoryBadges: boolean;
  onShowCategoryBadgesChange: (show: boolean) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  minigameFrequency: import('@/lib/minigames').MinigameFrequencyRange;
  onMinigameFrequencyChange: (value: import('@/lib/minigames').MinigameFrequencyRange) => void;
  viewMode: 'card' | 'stream';
  onViewModeChange: (mode: 'card' | 'stream') => void;
  userId: string | null;
  userWalletAddress?: string | null;
  userEmail?: string | null;
  // CategoryPanel props
  categories: Array<{ name: string; count: number }>;
  selectedCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  // ProgressPanel props
  progressStats: ProgressStats;
  score?: number;
  // Auth props
  isAuthenticated?: boolean;
  authEmail?: string;
  authAddress?: string;
  onSignOut?: () => void;
  // Panel states
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  progressOpen: boolean;
  setProgressOpen: (open: boolean) => void;
  categoryOpen: boolean;
  setCategoryOpen: (open: boolean) => void;
  memoryHooksOpen: boolean;
  setMemoryHooksOpen: (open: boolean) => void;
  // Children (main content)
  children: ReactNode;
  // Optional header (for edit mode)
  header?: ReactNode;
}

export function AppLayout({
  topMenuHandlers,
  role,
  onRoleChange,
  showEnglish,
  onShowEnglishChange,
  showCategoryBadges,
  onShowCategoryBadgesChange,
  theme,
  onThemeChange,
  minigameFrequency,
  onMinigameFrequencyChange,
  viewMode,
  onViewModeChange,
  userId,
  userWalletAddress,
  userEmail,
  isAuthenticated,
  authEmail,
  authAddress,
  onSignOut,
  categories,
  selectedCategories,
  onToggleCategory,
  progressStats,
  settingsOpen,
  setSettingsOpen,
  progressOpen,
  setProgressOpen,
  categoryOpen,
  setCategoryOpen,
  memoryHooksOpen,
  setMemoryHooksOpen,
  children,
  header,
  score,
}: AppLayoutProps) {
  return (
    <div className="app">
      <div className="auth-corner" aria-label="Sign in">
        <AuthButton
          isAuthenticated={isAuthenticated}
          authEmail={authEmail}
          authAddress={authAddress}
        />
      </div>
      {header}
      <TopMenu {...topMenuHandlers} score={score} />
      <SettingsPanel
        role={role}
        onRoleChange={onRoleChange}
        showEnglish={showEnglish}
        onShowEnglishChange={onShowEnglishChange}
        showCategoryBadges={showCategoryBadges}
        onShowCategoryBadgesChange={onShowCategoryBadgesChange}
        theme={theme}
        onThemeChange={onThemeChange}
        minigameFrequency={minigameFrequency}
        onMinigameFrequencyChange={onMinigameFrequencyChange}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userId={userId}
        userWalletAddress={userWalletAddress}
        userEmail={userEmail}
        isAuthenticated={isAuthenticated}
        authEmail={authEmail}
        authAddress={authAddress}
        onSignOut={onSignOut}
      />
      <CategoryPanel
        isOpen={categoryOpen}
        categories={categories}
        selectedCategories={selectedCategories}
        onToggleCategory={onToggleCategory}
        onClose={() => setCategoryOpen(false)}
      />
      <MemoryHooksPanel 
        isOpen={memoryHooksOpen} 
        onClose={() => setMemoryHooksOpen(false)}
      />
      <ProgressPanel
        isOpen={progressOpen}
        progressStats={progressStats}
        onClose={() => setProgressOpen(false)}
      />
      <ProgressSummary progressStats={progressStats} />

      {/* Desktop: score badge floating in left gutter */}
      {score !== undefined && (
        <div className="hidden lg:block z-[50]" style={{ position: 'fixed', left: '20px', top: '140px' }}>
          <ScoreBadge score={score} />
        </div>
      )}
      {/* Desktop: 📊 progress button in right gutter */}
      <button
        className="mode-btn hidden lg:flex z-[50]"
        style={{ position: 'fixed', right: '100px', top: '355px' }}
        onClick={topMenuHandlers.onProgress}
        type="button"
        aria-label="View progress"
      >
        📊
      </button>
      {/* Desktop: ℹ️ info button in right gutter */}
      <button
        className="mode-btn hidden lg:flex z-[50]"
        style={{ position: 'fixed', right: '20px', top: '150px' }}
        onClick={topMenuHandlers.onMemoryHooks}
        type="button"
        aria-label="Memory Hooks Info"
      >
        ℹ️
      </button>

      {children}
    </div>
  );
}
