'use client';

import { AppLayout } from '@/components/AppLayout';
import { CardDeckView, type CardDeckSwipeActions } from '@/components/CardDeckView';
import { VirtualizedWordList } from '@/components/VirtualizedWordList';
import { SettlingWordsFooter } from './SettlingWordsFooter';
import { useI18n } from '@/components/I18nProvider';
import type { MinigameFrequencyRange, MiniGameConfig } from '@/lib/minigames';
import type { NormalizedWord } from '@/lib/words';
import type { ProgressStats } from '@/lib/progress-stats';
import type { ViewMode } from '../app-state/types';

interface LearningStudyContentProps {
  viewMode: ViewMode;
  minigameFrequency: MinigameFrequencyRange;
  onMinigameFrequencyChange: (value: MinigameFrequencyRange) => void;
  isAuthenticated: boolean;
  authEmail?: string;
  authAddress?: string;
  onSignOut: () => void | Promise<void>;
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
  renderMiniGame: (config: MiniGameConfig) => React.ReactNode;
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
  authAddress,
  onSignOut,
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
      authAddress={authAddress}
      onSignOut={onSignOut}
      categories={categories}
      progressStats={progressStats}
    >
      <main
        className={`flex flex-col flex-1 min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden ${viewMode === 'card' ? 'learning-card-main' : ''}`}
        ref={phrasesCallbackRef}
        aria-live="polite"
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
      </main>
    </AppLayout>
  );
}
