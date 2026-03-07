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
import type { Role, Theme } from '@/hooks/useAppState';
import type { ProgressStats } from '@/lib/progress-stats';

interface AppLayoutProps {
  // TopMenu show-all state
  showAll: boolean;
  onShowAll: () => void;
  // For TopMenu category badge
  selectedCategories: Set<string>;
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
  onToggleCategory: (category: string) => void;
  // ProgressPanel props
  progressStats: ProgressStats;
  score?: number;
  // Auth props
  isAuthenticated?: boolean;
  authEmail?: string;
  authAddress?: string;
  onSignOut?: () => void;
  // Children (main content)
  children: ReactNode;
  // Optional header (for edit mode)
  header?: ReactNode;
}

export function AppLayout({
  showAll,
  onShowAll,
  selectedCategories,
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
  onToggleCategory,
  progressStats,
  children,
  header,
  score,
}: AppLayoutProps) {
  const { settingsOpen, progressOpen, categoryOpen, memoryHooksOpen, toggle, closeAll } =
    useMenuPanels();

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
      <TopMenu
        showAll={showAll}
        onShowAll={onShowAll}
        onMenuAction={toggle}
        categoryCount={selectedCategories.size}
        categoryActive={selectedCategories.size > 0}
        progressActive={progressOpen}
        score={score}
      />
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
        onClose={closeAll}
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
      <ProgressSummary progressStats={progressStats} />

      {children}
    </div>
  );
}
