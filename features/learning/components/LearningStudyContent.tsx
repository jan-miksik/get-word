'use client';

import type { StreakChipData } from '@/features/learning/goals/streakWeek';
import { AppLayout } from '@/components/AppLayout';
import { CardDeckView, type CardDeckSwipeActions } from './CardDeckView';
import { VirtualizedWordList } from './VirtualizedWordList';
import { SettlingWordsFooter } from './SettlingWordsFooter';
import { SessionRail } from './SessionRail';
import { QuickPracticeRail } from '@/features/learning/quick-practice/QuickPracticeRail';
import { SessionTimeStrip, type SessionTimeGoal } from './SessionTimeStrip';
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
  /**
   * Opens the add-words screen on its photo tab — offered from the empty deck
   * and the end-of-session card, which is where a learner is most likely to
   * want a fast way to more words.
   */
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
  /**
   * The add-words screen: one surface with a tab for each way in. It stays
   * mounted behind the deck once visited, so a half-typed batch and an analyzed
   * photo both survive a detour back to studying.
   */
  chatContent?: React.ReactNode;
  /**
   * The bonus block, when one is running: the round itself, plus how far the
   * block has got so the study area can pace it on its own rail.
   *
   * It takes the deck's place inside the study panel rather than covering the
   * surface with a panel of its own — that is what makes it look like every
   * other stretch of work instead of a screen that arrived from somewhere else.
   * The deck it replaces has already run out (the card that closes the day is
   * its empty state), so nothing is lost by standing where it stood.
   */
  practice?: {
    run: React.ReactNode;
    done: number;
    total: number;
    /** Clock-owned fallback: keep the time strip instead of the practice rail. */
    timed?: boolean;
  } | null;
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
  /**
   * Present only for a `minutes` goal, and then the rails count the day's time
   * down instead of its cards.
   */
  sessionTimeGoal?: SessionTimeGoal | null;
  renderCardForDeck: (
    word: NormalizedWord,
    stageIndex: number,
    onComplete: (
      afterExit?: () => void,
      options?: { skipAnimation?: boolean },
    ) => void,
    opts?: { isExiting: boolean; reinforcement?: boolean }
  ) => React.ReactNode;
  renderMiniGameForDeck: (config: MiniGameConfig, onComplete: () => void) => React.ReactNode;
  renderCard: (
    word: NormalizedWord,
    blockIndex?: number,
    options?: { reinforcement?: boolean },
  ) => React.ReactNode;
  renderMiniGame: (config: MiniGameConfig, isActive: boolean) => React.ReactNode;
  showNotReady: boolean;
  settlingCount: number;
  /** Repeats due right now that today's plan did not take. */
  dueNowCount?: number;
  /** Words never studied that today's plan did not reach. */
  newNowCount?: number;
  /** Lifts the day's cap so those leftovers join the stream. */
  onStudyExtra?: () => void;
  /** Starts a block of games that writes nothing back. See `SessionDoneCard`. */
  onPractice?: () => void;
  /** How many rounds that block is, for the offer's own copy. */
  practiceSize?: number;
  /**
   * The day's plan. A complete one turns the emptied deck from "nothing due"
   * into the card that closes the day — which is the only place that card
   * lives, because a finished day is a state rather than an event.
   */
  dayFlow?: SessionFlowState | null;
  /** The whole day as the server counted it, bonus round included. */
  dayScore?: {
    introduced: number;
    reviewed: number;
    target: number | null;
    met?: boolean;
  } | null;
  /** How far the day's plan fell short of the goal for want of words. */
  shortfall?: number;
  /** The study series, for the closing card and the header chip alike. */
  streak?: StreakChipData | null;
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
  practice = null,
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
  sessionTimeGoal,
  renderCardForDeck,
  renderMiniGameForDeck,
  renderCard,
  renderMiniGame,
  showNotReady,
  settlingCount,
  dueNowCount = 0,
  newNowCount = 0,
  onStudyExtra,
  onPractice,
  practiceSize = 0,
  dayFlow = null,
  dayScore = null,
  shortfall = 0,
  streak = null,
  onToggleShowNotReady,
}: LearningStudyContentProps) {
  const { t, language: uiLanguage } = useI18n();
  const personalPairLabel = learningLanguagePair
    ? `${getLocalizedLanguageName(learningLanguagePair.from, uiLanguage) ?? learningLanguagePair.from.toUpperCase()} → ${getLocalizedLanguageName(learningLanguagePair.to, uiLanguage) ?? learningLanguagePair.to.toUpperCase()}`
    : '';
  const showPhotoLabOffer = photoLabAvailable && Boolean(onOpenPhotoLab);
  const noPersonalWordsState = studyEmptyForPair && learningLanguagePair ? (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <p className="m-0 max-w-md text-lg font-semibold text-ink">
        {t('learning.noPersonalWords', { pair: personalPairLabel })}
      </p>
      {onOpenWordChat || showPhotoLabOffer ? (
        <p className="m-0 max-w-md text-sm text-ink opacity-70">
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
  // nothing due also carries a way to keep going. It is also where a finished
  // day is announced — once, here, instead of as an interstitial that has to be
  // dismissed onto a second copy of itself. `noPersonalWordsState` still wins
  // where the pair has no words at all, because that needs its own explanation
  // and offers.
  const sessionDoneState = (title?: string) => (
    <SessionDoneCard
      title={title}
      settlingCount={settlingCount}
      dueNowCount={dueNowCount}
      newNowCount={newNowCount}
      dayFlow={dayFlow}
      dayScore={dayScore}
      shortfall={shortfall}
      streak={streak}
      onStudyExtra={onStudyExtra}
      onPractice={onPractice}
      practiceSize={practiceSize}
      onOpenWordChat={onOpenWordChat}
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
      learningLanguagePair={learningLanguagePair}
      onLearningLanguagePairChange={onLearningLanguagePairChange}
      activeSurface={activeSurface}
      onSurfaceChange={onSurfaceChange}
      categories={categories}
      progressStats={progressStats}
      streak={streak}
    >
      <main
        className="app-workspace-main relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden"
        aria-live="polite"
      >
        {/* A minutes day is measured by the clock and a words day by its
            cards, so exactly one of the two ever appears: the countdown strip
            above the deck, or the rails at the edges of the study area. Both
            get out of the way once the day is walked — a clock still ticking
            beside the closing card paces work that no longer exists, and the
            card carries the day's settled time itself. */}
        {activeSurface === 'study' && (!practice || practice.timed) && sessionTimeGoal && sessionTimeGoal.budgetMs > 0 && !sessionFlow?.complete ? (
          <SessionTimeStrip goal={sessionTimeGoal} />
        ) : null}
        {sessionFlow && activeSurface === 'study' && !practice && !sessionTimeGoal ? (
          <SessionRail flow={sessionFlow} />
        ) : null}
        {/* The bonus block gets the same edge the session had, for the same
            reason: the panel below it scrolls, and this must not. */}
        {activeSurface === 'study' && practice && !practice.timed ? (
          <QuickPracticeRail done={practice.done} total={practice.total} />
        ) : null}
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
          // Once the day is complete, reclaim the large desktop bottom rest
          // reserved for ordinary card actions. Keeping it here left the
          // closing modal in a shorter box and visibly clipped its last action.
          // A running bonus block is card work whatever the view mode is, and it
          // wants the ordinary desktop bottom rest back: the trim below belongs
          // to the closing modal, which the block is standing in front of.
          className={practice || viewMode === 'card'
            ? `learning-card-main px-3 sm:px-0 ${!practice && dayFlow?.complete ? 'sm:!pb-4' : ''}`
            : ''}
        >
          {practice ? (
            practice.run
          ) : viewMode === 'card' ? (
            // No width cap here. The 800px reading width belongs to the cards
            // being studied, and `CardDeckView` applies it to those directly;
            // the closing modal owns its narrower cap in SessionCardShell.
            <div className="learning-card-viewport relative mx-auto flex h-full w-full flex-col gap-2">
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
        {/* One panel for all three ways of adding words. The photo tab still has
            its own `?surface=photo` address — old bookmarks and the menu link
            point at it — but it is a tab on this screen, not a screen of its
            own. */}
        {chatContent ? (
          <AppSurfacePanel
            surface="chat"
            active={activeSurface !== 'study'}
            label={t('addWords.title')}
          >
            {chatContent}
          </AppSurfacePanel>
        ) : null}
      </main>
    </AppLayout>
  );
}
