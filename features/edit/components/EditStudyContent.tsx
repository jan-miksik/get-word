'use client';

import { AppLayout } from '@/components/AppLayout';
import { BottomNav } from '@/components/BottomNav';
import { useI18n } from '@/components/I18nProvider';
import { VirtualizedWordList } from '@/components/VirtualizedWordList';
import type { MinigameFrequencyRange } from '@/lib/minigames';
import type { ProgressStats } from '@/lib/progress-stats';
import type { NormalizedWord } from '@/lib/words';
import { SettlingWordsFooter } from '@/features/learning/components/SettlingWordsFooter';

interface EditStudyContentProps {
  minigameFrequency: MinigameFrequencyRange;
  onMinigameFrequencyChange: (value: MinigameFrequencyRange) => void;
  isAuthenticated: boolean;
  authEmail?: string;
  authAddress?: string;
  onSignOut: () => void | Promise<void>;
  categories: Array<{ name: string; count: number }>;
  progressStats: ProgressStats;
  header: React.ReactNode;
  phrasesCallbackRef: (node: HTMLElement | null) => void;
  phrasesScrollElement: HTMLElement | null;
  filteredWords: NormalizedWord[];
  streamGroupedWords: NormalizedWord[][];
  renderEditableCard: (word: NormalizedWord, stageIndex?: number) => React.ReactNode;
  newWordsCount: number;
  settlingCount: number;
  showNotReady: boolean;
  onToggleShowNotReady: () => void;
  readyCount: number;
}

export function EditStudyContent({
  minigameFrequency,
  onMinigameFrequencyChange,
  isAuthenticated,
  authEmail,
  authAddress,
  onSignOut,
  categories,
  progressStats,
  header,
  phrasesCallbackRef,
  phrasesScrollElement,
  filteredWords,
  streamGroupedWords,
  renderEditableCard,
  newWordsCount,
  settlingCount,
  showNotReady,
  onToggleShowNotReady,
  readyCount,
}: EditStudyContentProps) {
  const { t } = useI18n();

  return (
    <AppLayout
      viewMode="stream"
      onViewModeChange={() => {}}
      minigameFrequency={minigameFrequency}
      onMinigameFrequencyChange={onMinigameFrequencyChange}
      isAuthenticated={isAuthenticated}
      authEmail={authEmail}
      authAddress={authAddress}
      onSignOut={onSignOut}
      categories={categories}
      progressStats={progressStats}
      header={header}
    >
      <main
        className="block flex-1 min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden"
        ref={phrasesCallbackRef}
        aria-live="polite"
      >
        <div className="app-content-column flex flex-col gap-[18px] flex-1 min-h-0">
          {filteredWords.length === 0 ? (
            <div className="p-8 text-center text-text-soft">{t('learning.noFilterMatches')}</div>
          ) : (
            <VirtualizedWordList
              key="stream"
              dataTab="stream"
              groupedWords={streamGroupedWords}
              renderCard={renderEditableCard}
              showHeaders={false}
              scrollElement={phrasesScrollElement}
              emptyMessage={t('learning.noWords')}
              stageFooter={(stageIndex) => {
                const isLastMainSlot =
                  (stageIndex === 1 && newWordsCount > 0) ||
                  (stageIndex === 0 && newWordsCount === 0);
                if (!isLastMainSlot || settlingCount === 0) return null;
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
      </main>

      <BottomNav readyCount={readyCount} />
    </AppLayout>
  );
}
