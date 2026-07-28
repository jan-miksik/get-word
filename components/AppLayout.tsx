'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { TopMenu } from '@/components/TopMenu';
import type { SchoolMembership } from '@/features/auth/client/useAuth';
import { AuthButton } from '@/components/AuthButton';
import { SettingsPanel } from '@/components/SettingsPanel';
import { LearningSettingsPanel } from '@/features/learning/components/LearningSettingsPanel';
import { CategoryPanel } from '@/features/learning/components/CategoryPanel';
import { MemoryHooksPanel } from '@/features/learning/components/MemoryHooksPanel';
import { ProgressSummary } from '@/features/learning/components/ProgressSummary';
import { UpcomingPanel } from '@/features/learning/components/UpcomingPanel';
import { useMenuPanels } from '@/hooks/useMenuPanels';
import { useAppStateContext } from '@/context/AppStateContext';
import { PWAInstallBanner } from '@/components/PWAInstallBanner';
import { SpeckledBackground } from '@/components/SpeckledBackground';
import { useI18n } from '@/components/I18nProvider';
import type { ProgressStats } from '@/lib/progress-stats';
import {
  clearPendingCommonListAudio,
  readPendingCommonListAudio,
} from '@/features/learning/onboarding/pendingCommonListAudio';

interface AppLayoutProps {
  // Page-level UI state (localStorage-only, not in context)
  viewMode: 'card' | 'stream';
  minigameFrequency: import('@/features/learning/minigames').MinigameFrequencyRange;
  onMinigameFrequencyChange: (
    value: import('@/features/learning/minigames').MinigameFrequencyRange
  ) => void;
  // Auth (from useAuth, not useAppState)
  isAuthenticated?: boolean;
  authEmail?: string;
  authAddress?: string;
  onSignOut?: () => void | Promise<void>;
  /** Optional inert account display for isolated UI previews. */
  accountSlotOverride?: ReactNode;
  /** Active school membership, surfaced in the menu. */
  school?: SchoolMembership | null;
  /** Opens the word chat from the menu without a full page load. */
  onOpenWordChat?: () => void;
  /** Opens photo lab in place, the same way. */
  onOpenPhotoLab?: () => void;
  // Page-computed values (differ between main and edit page)
  categories: Array<{ name: string; count: number }>;
  progressStats: ProgressStats;
  // Layout
  header?: ReactNode;
  children: ReactNode;
}

export function AppLayout({
  viewMode,
  minigameFrequency,
  onMinigameFrequencyChange,
  isAuthenticated,
  authEmail,
  authAddress,
  onSignOut,
  accountSlotOverride,
  school,
  onOpenWordChat,
  onOpenPhotoLab,
  categories,
  progressStats,
  header,
  children,
}: AppLayoutProps) {
  const { t } = useI18n();
  const {
    settingsOpen,
    learningOpen,
    categoryOpen,
    memoryHooksOpen,
    upcomingOpen,
    toggle,
    closeAll,
  } = useMenuPanels();

  const {
    showAll,
    setShowAll,
    selectedCategories,
    gameScore,
    subscribedLists,
    activeListId,
    setActiveListId,
    syncedWords,
    photoLabEnabled,
    quickAddEnabled,
  } = useAppStateContext();
  const [pendingAudioListId, setPendingAudioListId] = useState<string | null>(() =>
    readPendingCommonListAudio()?.listId ?? null,
  );

  const activeList = subscribedLists.find((list) => list.id === activeListId) ?? null;
  const activeListLanguagePair = activeList
    ? { from: activeList.languageFrom, to: activeList.languageTo }
    : null;
  const listsWithAudioMarkers = useMemo(
    () =>
      subscribedLists.map((list) => ({
        ...list,
        audioIncomplete: list.id === pendingAudioListId,
      })),
    [pendingAudioListId, subscribedLists],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const pending = readPendingCommonListAudio();
      setPendingAudioListId(pending?.listId ?? null);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeListId, subscribedLists]);

  useEffect(() => {
    if (!pendingAudioListId || activeListId !== pendingAudioListId || !syncedWords?.length) return;
    const hasAudio = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value.some(Boolean) : Boolean(value);
    const hasMissingAudio = syncedWords.some(
      (word) => !hasAudio(word.czAudio) || !hasAudio(word.viAudio),
    );
    if (hasMissingAudio) return;
    clearPendingCommonListAudio(pendingAudioListId);
    const timeoutId = window.setTimeout(() => setPendingAudioListId(null), 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeListId, pendingAudioListId, syncedWords]);

  return (
    <div
      className="app bg-[#dcd1b9]"
      data-view-mode={viewMode}
    >
      <SpeckledBackground showRisingLetters={false} />
      {header}
      <header className="app-header-bar" aria-label={t('auth.brand')}>
        <TopMenu
          showAll={showAll}
          onShowAll={() => setShowAll(!showAll)}
          onMenuAction={toggle}
          categoryCount={selectedCategories.size}
          categoryActive={categories.length > 0 && selectedCategories.size < categories.length}
          score={gameScore}
          lists={listsWithAudioMarkers.length > 0 ? listsWithAudioMarkers : undefined}
          activeListId={activeListId}
          onListChange={setActiveListId}
          activeListLanguagePair={activeListLanguagePair}
          photoLabEnabled={photoLabEnabled}
          school={school}
          onOpenWordChat={onOpenWordChat}
          onOpenPhotoLab={onOpenPhotoLab}
          quickAddEnabled={quickAddEnabled}
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
            accountSlotOverride !== undefined
              ? accountSlotOverride
              : isAuthenticated
              ? (
                  <div className="flex items-center gap-2 w-full">
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
                        className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg bg-transparent border-2 border-[#2A2218] text-[#2A2218] hover:bg-[#1E6FA8] hover:border-[#1E6FA8] hover:text-[#F4EFE2] transition-colors"
                        aria-label={t('common.signOut')}
                        title={t('common.signOut')}
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
        isOpen={settingsOpen}
        onClose={closeAll}
        isAuthenticated={isAuthenticated}
        authEmail={authEmail}
        authAddress={authAddress}
        onSignOut={onSignOut}
      />
      <LearningSettingsPanel
        minigameFrequency={minigameFrequency}
        onMinigameFrequencyChange={onMinigameFrequencyChange}
        isOpen={learningOpen}
        onClose={closeAll}
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
      <UpcomingPanel isOpen={upcomingOpen} onClose={closeAll} progressStats={progressStats} />

      <PWAInstallBanner />
      {children}
    </div>
  );
}
