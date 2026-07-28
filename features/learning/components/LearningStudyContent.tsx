'use client';

import { AppLayout } from '@/components/AppLayout';
import { CardDeckView, type CardDeckSwipeActions } from './CardDeckView';
import { VirtualizedWordList } from './VirtualizedWordList';
import { SettlingWordsFooter } from './SettlingWordsFooter';
import type { SchoolMembership } from '@/features/auth/client/useAuth';
import { useI18n } from '@/components/I18nProvider';
import type { MinigameFrequencyRange, MiniGameConfig } from '@/features/learning/minigames';
import type { NormalizedWord } from '@/lib/words';
import type { ProgressStats } from '@/lib/progress-stats';
import type { ViewMode } from '../app-state/types';
import { AppSurfacePanel } from '@/features/workspace/AppSurfacePanel';
import type { AppSurface } from '@/features/workspace/surface-history';

interface LearningStudyContentProps {
  viewMode: ViewMode;
  minigameFrequency: MinigameFrequencyRange;
  onMinigameFrequencyChange: (value: MinigameFrequencyRange) => void;
  isAuthenticated: boolean;
  authEmail?: string;
  school?: SchoolMembership | null;
  authAddress?: string;
  onSignOut: () => void | Promise<void>;
  /** Opens the word chat from the menu, in place. */
  onOpenWordChat?: () => void;
  /** Opens photo lab over the study view instead of navigating to `/photo-lab`. */
  onOpenPhotoLab?: () => void;
  activeSurface?: AppSurface;
  onSurfaceChange?: (surface: AppSurface) => void;
  chatContent?: React.ReactNode;
  photoContent?: React.ReactNode;
  categories: Array<{ name: string; count: number }>;
  progressStats: ProgressStats;
  phrasesCallbackRef: (node: HTMLElement | null) => void;
  phrasesScrollElement: HTMLElement | null;
  filteredWords: NormalizedWord[];
  interstitialCard?: React.ReactNode;
  onDeckWordCardCompleted?: (word: NormalizedWord) => void;
  deckSwipeActions?: CardDeckSwipeActions;
  deckHorizontalSwipeEnabled?: boolean;
  cardDeckGroups: (NormalizedWord | MiniGameConfig)[][];
  streamGroupedWords: (NormalizedWord | MiniGameConfig)[][];
  renderCardForDeck: (
    word: NormalizedWord,
    stageIndex: number,
    onComplete: (
      afterExit?: () => void,
      options?: { skipAnimation?: boolean },
    ) => void,
    opts?: { isExiting: boolean }
  ) => React.ReactNode;
  renderMiniGameForDeck: (config: MiniGameConfig, onComplete: () => void) => React.ReactNode;
  renderCard: (word: NormalizedWord, stageIndex?: number) => React.ReactNode;
  renderMiniGame: (config: MiniGameConfig, isActive: boolean) => React.ReactNode;
  dueWordsCount: number;
  showNotReady: boolean;
  settlingCount: number;
  onToggleShowNotReady: () => void;
}

export function LearningStudyContent({
  viewMode,
  minigameFrequency,
  onMinigameFrequencyChange,
  isAuthenticated,
  authEmail,
  school,
  authAddress,
  onSignOut,
  onOpenWordChat,
  onOpenPhotoLab,
  activeSurface = 'study',
  onSurfaceChange,
  chatContent,
  photoContent,
  categories,
  progressStats,
  phrasesCallbackRef,
  phrasesScrollElement,
  filteredWords,
  interstitialCard,
  onDeckWordCardCompleted,
  deckSwipeActions,
  deckHorizontalSwipeEnabled = true,
  cardDeckGroups,
  streamGroupedWords,
  renderCardForDeck,
  renderMiniGameForDeck,
  renderCard,
  renderMiniGame,
  dueWordsCount,
  showNotReady,
  settlingCount,
  onToggleShowNotReady,
}: LearningStudyContentProps) {
  const { t } = useI18n();

  return (
    <AppLayout
      viewMode={viewMode}
      minigameFrequency={minigameFrequency}
      onMinigameFrequencyChange={onMinigameFrequencyChange}
      isAuthenticated={isAuthenticated}
      authEmail={authEmail}
      school={school}
      authAddress={authAddress}
      onSignOut={onSignOut}
      onOpenWordChat={onOpenWordChat}
      onOpenPhotoLab={onOpenPhotoLab}
      activeSurface={activeSurface}
      onSurfaceChange={onSurfaceChange}
      categories={categories}
      progressStats={progressStats}
    >
      <main
        className="app-workspace-main flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden"
        aria-live="polite"
      >
        <AppSurfacePanel
          surface="study"
          active={activeSurface === 'study'}
          label={t('auth.brand')}
          panelRef={phrasesCallbackRef}
          className={viewMode === 'card' ? 'learning-card-main' : ''}
        >
          {viewMode === 'card' ? (
            <div className="learning-card-viewport relative flex h-full w-full flex-col max-w-[800px] mx-auto">
              <CardDeckView
                groupedWords={cardDeckGroups}
                interstitialCard={interstitialCard}
                onWordCardCompleted={onDeckWordCardCompleted}
                swipeActions={deckSwipeActions}
                allowHorizontalSwipe={deckHorizontalSwipeEnabled}
                renderCard={renderCardForDeck}
                renderMiniGame={renderMiniGameForDeck}
              />
            </div>
          ) : (
            <div className="app-content-column flex flex-col gap-[18px] flex-1 min-h-0">
              {interstitialCard ? (
                <div className="shrink-0">
                  {interstitialCard}
                </div>
              ) : null}
              {filteredWords.length === 0 ? (
                <div className="p-8 text-center text-text-soft">{t('learning.noFilterMatches')}</div>
              ) : (
                <VirtualizedWordList
                  dataTab="stream"
                  groupedWords={streamGroupedWords}
                  renderCard={renderCard}
                  renderMiniGame={renderMiniGame}
                  showHeaders={false}
                  scrollElement={phrasesScrollElement}
                  emptyMessage={t('learning.noWords')}
                  stageFooter={(stageIndex) => {
                    const repeatsInStream = dueWordsCount + (showNotReady ? settlingCount : 0);
                    const footerStageIndex = repeatsInStream > 0 ? 0 : 1;
                    if (stageIndex !== footerStageIndex || settlingCount === 0) return null;
                    return (
                      <SettlingWordsFooter
                        showNotReady={showNotReady}
                        settlingCount={settlingCount}
                        onToggle={onToggleShowNotReady}
                      />
                    );
                  }}
                />
              )}
            </div>
          )}
        </AppSurfacePanel>
        {chatContent ? (
          <AppSurfacePanel
            surface="chat"
            active={activeSurface === 'chat'}
            label={t('wordChat.addWords')}
          >
            {chatContent}
          </AppSurfacePanel>
        ) : null}
        {photoContent ? (
          <AppSurfacePanel
            surface="photo"
            active={activeSurface === 'photo'}
            label={t('photoLab.title')}
          >
            {photoContent}
          </AppSurfacePanel>
        ) : null}
      </main>
    </AppLayout>
  );
}
