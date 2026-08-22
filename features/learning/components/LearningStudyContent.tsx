'use client';

import { AppLayout } from '@/components/AppLayout';
import { CardDeckView, type CardDeckSwipeActions } from './CardDeckView';
import { VirtualizedWordList } from './VirtualizedWordList';
import { SettlingWordsFooter } from './SettlingWordsFooter';
import { SessionRail } from './SessionRail';
import { SessionDoneCard } from './SessionDoneCard';
import type { SchoolMembership } from '@/features/auth/public.client';
import { useI18n } from '@/components/I18nProvider';
import { getLocalizedLanguageName } from '@/lib/i18n/languages';
import type { MinigameFrequencyRange, MiniGameConfig } from '@/features/learning/minigames';
import type { LearningStreamGroup } from '@/features/learning/types';
import type { SessionFlowState } from '@/features/learning/session/flow';
import type { NormalizedWord } from '@/lib/words';
import type { ProgressStats } from '@/lib/progress-stats';
import type { ViewMode } from '../app-state/types';
import { AppSurfacePanel, type AppSurface } from '@/features/workspace/public.client';

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
  learningLanguagePair?: { from: string; to: string } | null;
  onLearningLanguagePairChange?: (pair: { from: string; to: string }) => void | Promise<void>;
  /**
   * This pair has no study words at all — no list selected for it, a list with
   * no items yet, or the default catalogue held back until the learner adds a
   * personal word. Not the same as "no words match the filters", which keeps
   * its own message, and not the same as an emptied deck, which is All done.
   */
  studyEmptyForPair: boolean;
  /** Whether the photo lab may be offered as a way to collect first words. */
  photoLabAvailable?: boolean;
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
  isSwipeBlockedForWord?: (wordId: string) => boolean;
  streamGroups: LearningStreamGroup[];
  sessionFlow?: SessionFlowState;
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
  showNotReady: boolean;
  settlingCount: number;
  /** Repeats due right now that today's plan did not take. */
  dueNowCount?: number;
  /** Lifts the day's cap so those repeats join the stream. */
  onStudyExtra?: () => void;
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
  learningLanguagePair,
  onLearningLanguagePairChange,
  studyEmptyForPair,
  photoLabAvailable = false,
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
  isSwipeBlockedForWord,
  streamGroups,
  sessionFlow,
  renderCardForDeck,
  renderMiniGameForDeck,
  renderCard,
  renderMiniGame,
  showNotReady,
  settlingCount,
  dueNowCount = 0,
  onStudyExtra,
  onToggleShowNotReady,
}: LearningStudyContentProps) {
  const { t, language: uiLanguage } = useI18n();
  const personalPairLabel = learningLanguagePair
    ? `${getLocalizedLanguageName(learningLanguagePair.from, uiLanguage) ?? learningLanguagePair.from.toUpperCase()} → ${getLocalizedLanguageName(learningLanguagePair.to, uiLanguage) ?? learningLanguagePair.to.toUpperCase()}`
    : '';
  const showPhotoLabOffer = photoLabAvailable && Boolean(onOpenPhotoLab);
  const noPersonalWordsState = studyEmptyForPair && learningLanguagePair ? (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <p className="m-0 max-w-md text-lg font-semibold text-[#2A2218]">
        {t('learning.noPersonalWords', { pair: personalPairLabel })}
      </p>
      {onOpenWordChat || showPhotoLabOffer ? (
        <p className="m-0 max-w-md text-sm text-[#2A2218] opacity-70">
          {t('learning.noPersonalWordsHint')}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onOpenWordChat ? (
          <button
            type="button"
            onClick={onOpenWordChat}
            className="onboarding-option onboarding-option-highlight rounded-full px-5 py-2.5 text-sm font-extrabold"
          >
            {t('wordChat.addWords')}
          </button>
        ) : null}
        {showPhotoLabOffer ? (
          <button
            type="button"
            onClick={onOpenPhotoLab}
            className="onboarding-option rounded-full px-5 py-2.5 text-sm font-extrabold"
          >
            {t('learning.noPersonalWordsPhotoLab')}
          </button>
        ) : null}
      </div>
    </div>
  ) : null;

  // The deck emptying is never a dead end: the same card that says there is
  // nothing due also carries the ways to keep going. `noPersonalWordsState`
  // still wins where the pair has no words at all, because that needs its own
  // explanation before the same offers make sense.
  const sessionDoneState = (title?: string) => (
    <SessionDoneCard
      title={title}
      settlingCount={settlingCount}
      dueNowCount={dueNowCount}
      onStudyExtra={onStudyExtra}
      showNotReady={showNotReady}
      onToggleShowNotReady={onToggleShowNotReady}
      onOpenWordChat={onOpenWordChat}
      onOpenPhotoLab={showPhotoLabOffer ? onOpenPhotoLab : undefined}
    />
  );

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
      learningLanguagePair={learningLanguagePair}
      onLearningLanguagePairChange={onLearningLanguagePairChange}
      activeSurface={activeSurface}
      onSurfaceChange={onSurfaceChange}
      categories={categories}
      progressStats={progressStats}
    >
      <main
        className="app-workspace-main relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden"
        aria-live="polite"
      >
        {sessionFlow && activeSurface === 'study' ? <SessionRail flow={sessionFlow} /> : null}
        <AppSurfacePanel
          surface="study"
          active={activeSurface === 'study'}
          label={t('auth.brand')}
          panelRef={phrasesCallbackRef}
          // On a phone the deck otherwise runs to both screen edges, right over
          // the session rails — and a scratch cover reaching the bezel is both
          // hard to erase and impossible to read the rails beside. The gutter
          // is inside padding, so the absolutely positioned rails stay pinned
          // to the real edges. Stream mode already has `app-content-column`
          // padding, so only the deck needs it.
          className={viewMode === 'card' ? 'learning-card-main px-3 sm:px-0' : ''}
        >
          {viewMode === 'card' ? (
            <div className="learning-card-viewport relative mx-auto flex h-full w-full max-w-[800px] flex-col gap-2">
              <div className="min-h-0 flex-1">
                <CardDeckView
                  streamGroups={streamGroups}
                  interstitialCard={interstitialCard}
                  emptyState={noPersonalWordsState ?? sessionDoneState()}
                  onWordCardCompleted={onDeckWordCardCompleted}
                  swipeActions={deckSwipeActions}
                  allowHorizontalSwipe={deckHorizontalSwipeEnabled}
                  isSwipeBlockedForWord={isSwipeBlockedForWord}
                  renderCard={renderCardForDeck}
                  renderMiniGame={renderMiniGameForDeck}
                />
              </div>
            </div>
          ) : (
            <div className="app-content-column flex flex-col gap-[18px] flex-1 min-h-0">
              {interstitialCard ? (
                <div className="shrink-0">
                  {interstitialCard}
                </div>
              ) : null}
              {filteredWords.length === 0 ? (
                noPersonalWordsState ?? sessionDoneState(t('learning.noFilterMatches'))
              ) : (
                <VirtualizedWordList
                  dataTab="stream"
                  streamGroups={streamGroups}
                  renderCard={renderCard}
                  renderMiniGame={renderMiniGame}
                  showHeaders={false}
                  scrollElement={phrasesScrollElement}
                  emptyMessage={t('learning.noWords')}
                  groupFooter={(group) => {
                    const lastGroup = streamGroups.at(-1);
                    if (group.key !== lastGroup?.key || settlingCount === 0) return null;
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
