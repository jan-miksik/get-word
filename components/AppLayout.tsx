'use client';

import { ReactNode } from 'react';
import { TopMenu } from '@/components/TopMenu';
import { SettingsPanel } from '@/components/SettingsPanel';
import { CategoryPanel } from '@/components/CategoryPanel';
import { MemoryHooksPanel } from '@/components/MemoryHooksPanel';
import { ProgressPanel } from '@/components/ProgressPanel';
import { ProgressSummary } from '@/components/ProgressSummary';
import type { Role, Tab, Theme } from '@/hooks/useAppState';
import type { ProgressStats } from '@/lib/progress-stats';

interface AppLayoutProps {
  // TopMenu props
  topMenuHandlers: {
    onSwitch: (e: React.MouseEvent) => void;
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
  userId: string | null;
  // CategoryPanel props
  categories: Array<{ name: string; count: number }>;
  selectedCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  // ProgressPanel props
  progressStats: ProgressStats;
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
  userId,
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
}: AppLayoutProps) {
  return (
    <div className="app">
      {header}
      <TopMenu {...topMenuHandlers} />
      <SettingsPanel 
        role={role} 
        onRoleChange={onRoleChange}
        showEnglish={showEnglish}
        onShowEnglishChange={onShowEnglishChange}
        showCategoryBadges={showCategoryBadges}
        onShowCategoryBadgesChange={onShowCategoryBadgesChange}
        theme={theme}
        onThemeChange={onThemeChange}
        isOpen={settingsOpen} 
        onClose={() => setSettingsOpen(false)}
        userId={userId}
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
      {children}
    </div>
  );
}
