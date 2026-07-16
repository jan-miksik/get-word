'use client';

import { useCallback, useRef } from 'react';
import { WordCard } from '@/components/WordCard';
import { MiniGameCard } from '@/components/MiniGameCard';
import { TypingStudyCard, type TypingOutcome } from '@/features/learning/components/TypingStudyCard';
import type { TypingWriteIn } from '@/features/learning/state/preferences';
import type { ProgressData } from '@/lib/sync';
import type { MiniGameConfig } from '@/lib/minigames';
import type { NormalizedWord } from '@/lib/words';
import type { LearningRole } from '@/features/learning/state/learningRole';

const isMobileLayout = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(max-width: 767px)').matches === true;

interface UseLearningRenderersOptions {
  progress: Record<string, ProgressData>;
  role: LearningRole;
  getWordDisplayMode: (wordId: string) => 0 | 1;
  showAll: boolean;
  getMemoryHook: (word: Pick<NormalizedWord, 'id' | 'canonicalWordId'>) => string;
  getSuggestedMemoryHook: (word: NormalizedWord) => string;
  markKnown: (wordId: string) => void;
  markReallyKnown: (wordId: string) => void;
  markUnknown: (wordId: string) => void;
  setCustomStage: (wordId: string, stageIndex: number, opts?: { noRepeat?: boolean }) => void;
  setMemoryHook: (word: Pick<NormalizedWord, 'id' | 'canonicalWordId'>, hook: string) => void;
  lastMovedId: string | null;
  showEnglish: boolean;
  showCategoryBadges: boolean;
  showPronunciation: boolean;
  categoryOrder: string[];
  shouldRenderMemoryHook: (wordId: string) => boolean;
  studyNotesEnabled: boolean;
  studyNoteMinimizeFromStage: number;
  swipeCardsEnabled: boolean;
  typingModeEnabled: boolean;
  typingWriteIn: TypingWriteIn;
  typingPrefillPunctuation: boolean;
  typingMobileKeyboardAutoFocus: boolean;
  typingPlayAudioAfterCheck: boolean;
  typingCheckButtonEnabled: boolean;
  dismissedGames: Set<string>;
  setDismissedGames: React.Dispatch<React.SetStateAction<Set<string>>>;
  setGameScore: React.Dispatch<React.SetStateAction<number>>;
}

export function useLearningRenderers({
  progress,
  role,
  getWordDisplayMode,
  showAll,
  getMemoryHook,
  getSuggestedMemoryHook,
  markKnown,
  markReallyKnown,
  markUnknown,
  setCustomStage,
  setMemoryHook,
  lastMovedId,
  showEnglish,
  showCategoryBadges,
  showPronunciation,
  categoryOrder,
  shouldRenderMemoryHook,
  studyNotesEnabled,
  studyNoteMinimizeFromStage,
  swipeCardsEnabled,
  typingModeEnabled,
  typingWriteIn,
  typingPrefillPunctuation,
  typingMobileKeyboardAutoFocus,
  typingPlayAudioAfterCheck,
  typingCheckButtonEnabled,
  dismissedGames,
  setDismissedGames,
  setGameScore,
}: UseLearningRenderersOptions) {
  const lockedDeckCardStateRef = useRef<Map<string, { modeIndex: number; progress: ProgressData }>>(
    new Map()
  );

  // Typing mode wires quiz-style results into the spaced-repetition stages:
  // clean success advances, a hinted/near answer reschedules at the same
  // stage, and a failure steps the word down.
  // Score lands as soon as the answer is checked; the SR stage moves only
  // when the card advances (continue tap), so the two are wired separately.
  const applyTypingScore = useCallback(
    (points: number) => {
      if (points > 0) setGameScore((prev) => Math.max(0, prev + points));
    },
    [setGameScore]
  );

  const applyTypingOutcome = useCallback(
    (wordId: string, stageIndex: number, outcome: TypingOutcome) => {
      if (outcome === 'known') markKnown(wordId);
      else if (outcome === 'unknown') markUnknown(wordId);
      else setCustomStage(wordId, stageIndex);
    },
    [markKnown, markUnknown, setCustomStage]
  );

  const renderCard = useCallback((word: NormalizedWord, _stageIndex?: number) => {
    void _stageIndex;
    const prog = progress[word.id] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
    if (typingModeEnabled) {
      return (
        <div key={word.id} className="pt-8">
          <TypingStudyCard
            word={word}
            progress={prog}
            role={role}
            writeIn={typingWriteIn}
            audioPromptEnabled={false}
            prefillPunctuation={typingPrefillPunctuation}
            playAudioAfterCheck={typingPlayAudioAfterCheck}
            checkButtonEnabled={typingCheckButtonEnabled}
            modeIndex={getWordDisplayMode(word.id)}
            onScore={applyTypingScore}
            onOutcome={(outcome) =>
              applyTypingOutcome(word.id, prog.stageIndex, outcome)
            }
            onCustomStage={(stageIndex, opts) => setCustomStage(word.id, stageIndex, opts)}
            memoryHook={getMemoryHook(word)}
            suggestedHook={getSuggestedMemoryHook(word)}
            onMemoryHookChange={(hook) => setMemoryHook(word, hook)}
            showMemoryHook={shouldRenderMemoryHook(word.id)}
          />
        </div>
      );
    }
    return (
      <div key={word.id} className="pt-8">
        <WordCard
          word={word}
          progress={prog}
          role={role}
          modeIndex={getWordDisplayMode(word.id)}
          showAll={showAll}
          memoryHook={getMemoryHook(word)}
          suggestedHook={getSuggestedMemoryHook(word)}
          onKnown={() => markKnown(word.id)}
          onReallyKnown={() => markReallyKnown(word.id)}
          onCustomStage={(stageIndex, opts) => setCustomStage(word.id, stageIndex, opts)}
          onUnknown={() => markUnknown(word.id)}
          onMemoryHookChange={(hook) => setMemoryHook(word, hook)}
          isMoved={lastMovedId === word.id}
          showEnglish={showEnglish}
          showCategoryBadges={showCategoryBadges}
          showPronunciation={showPronunciation}
          categoryOrder={categoryOrder}
          showMemoryHook={shouldRenderMemoryHook(word.id)}
          studyNotesEnabled={studyNotesEnabled}
          studyNoteMinimizeFromStage={studyNoteMinimizeFromStage}
        />
      </div>
    );
  }, [progress, role, getWordDisplayMode, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setCustomStage, setMemoryHook, lastMovedId, showEnglish, showCategoryBadges, showPronunciation, categoryOrder, shouldRenderMemoryHook, studyNotesEnabled, studyNoteMinimizeFromStage, typingModeEnabled, typingWriteIn, typingPrefillPunctuation, typingPlayAudioAfterCheck, typingCheckButtonEnabled, applyTypingScore, applyTypingOutcome]);

  const renderMiniGame = useCallback((config: MiniGameConfig) => {
    if (dismissedGames.has(config.id)) return null;
    return (
      <div key={config.id} className="pt-8 h-full min-h-0 flex flex-col">
        <div className="flex-1 min-h-0">
          <MiniGameCard
            config={config}
            role={role}
            onDismiss={() => setDismissedGames((prev) => new Set([...prev, config.id]))}
            onResult={(delta) => setGameScore((prev) => Math.max(0, prev + delta))}
          />
        </div>
      </div>
    );
  }, [dismissedGames, role, setDismissedGames, setGameScore]);

  const renderCardForDeck = useCallback(
    (
      word: NormalizedWord,
      _stageIndex: number,
      onComplete: (
        afterExit?: () => void,
        options?: { skipAnimation?: boolean },
      ) => void,
      opts?: { isExiting: boolean }
    ) => {
      const liveProg = progress[word.id] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
      const liveModeIndex = getWordDisplayMode(word.id);
      const isExiting = opts?.isExiting ?? false;
      const locked = lockedDeckCardStateRef.current.get(word.id);
      if (isExiting) {
        if (!locked) {
          lockedDeckCardStateRef.current.set(word.id, {
            modeIndex: liveModeIndex,
            progress: liveProg,
          });
        }
      } else if (locked) {
        lockedDeckCardStateRef.current.delete(word.id);
      }
      const cardState = isExiting
        ? lockedDeckCardStateRef.current.get(word.id)
        : null;
      const prog = cardState?.progress ?? liveProg;
      const modeIndex = cardState?.modeIndex ?? liveModeIndex;
      if (typingModeEnabled) {
        return (
          <div key={word.id} className="h-full flex flex-col justify-end md:justify-start relative">
            <TypingStudyCard
              word={word}
              progress={prog}
              role={role}
              writeIn={typingWriteIn}
              audioPromptEnabled={false}
              prefillPunctuation={typingPrefillPunctuation}
              playAudioAfterCheck={typingPlayAudioAfterCheck}
              checkButtonEnabled={typingCheckButtonEnabled}
              modeIndex={modeIndex as 0 | 1}
              onScore={applyTypingScore}
              onOutcome={(outcome) => {
                onComplete(
                  () => applyTypingOutcome(word.id, prog.stageIndex, outcome),
                  {
                    // iOS only raises the keyboard reliably while the Continue
                    // tap is still active, so mobile typing skips the deck exit.
                    skipAnimation: typingMobileKeyboardAutoFocus && isMobileLayout(),
                  },
                );
              }}
              onCustomStage={(stageIndex, opts) => {
                onComplete(
                  () => setCustomStage(word.id, stageIndex, opts),
                  {
                    skipAnimation: typingMobileKeyboardAutoFocus && isMobileLayout(),
                  },
                );
              }}
              memoryHook={getMemoryHook(word)}
              suggestedHook={getSuggestedMemoryHook(word)}
              onMemoryHookChange={(hook) => setMemoryHook(word, hook)}
              showMemoryHook={shouldRenderMemoryHook(word.id)}
              fullscreen
              autoFocus={!isExiting}
              autoFocusOnMobile={typingMobileKeyboardAutoFocus}
            />
          </div>
        );
      }
      return (
        <div key={word.id} className="h-full flex flex-col justify-end md:justify-start relative">
          <WordCard
            word={word}
            progress={prog}
            role={role}
            modeIndex={modeIndex}
            showAll={showAll}
            memoryHook={getMemoryHook(word)}
            suggestedHook={getSuggestedMemoryHook(word)}
            onKnown={() => { onComplete(() => markKnown(word.id)); }}
            onReallyKnown={() => { onComplete(() => markReallyKnown(word.id)); }}
            onCustomStage={(stageIndex, opts) => { onComplete(() => setCustomStage(word.id, stageIndex, opts)); }}
            onUnknown={() => { onComplete(() => markUnknown(word.id)); }}
            onMemoryHookChange={(hook) => setMemoryHook(word, hook)}
            isMoved={false}
            showEnglish={showEnglish}
            showCategoryBadges={showCategoryBadges}
            showPronunciation={showPronunciation}
            categoryOrder={categoryOrder}
            showMemoryHook={shouldRenderMemoryHook(word.id)}
            studyNotesEnabled={studyNotesEnabled}
            studyNoteMinimizeFromStage={studyNoteMinimizeFromStage}
            mobileCustomActionOnly={swipeCardsEnabled}
            fullscreen
          />
        </div>
      );
    },
    [progress, role, getWordDisplayMode, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setCustomStage, setMemoryHook, showEnglish, showCategoryBadges, showPronunciation, categoryOrder, shouldRenderMemoryHook, studyNotesEnabled, studyNoteMinimizeFromStage, swipeCardsEnabled, typingModeEnabled, typingWriteIn, typingPrefillPunctuation, typingMobileKeyboardAutoFocus, typingPlayAudioAfterCheck, typingCheckButtonEnabled, applyTypingScore, applyTypingOutcome]
  );

  const renderMiniGameForDeck = useCallback(
    (config: MiniGameConfig, onComplete: () => void) => (
      <div key={config.id} className="h-full">
        <MiniGameCard
          config={config}
          role={role}
          onDismiss={() => {
            setDismissedGames((prev) => new Set([...prev, config.id]));
            onComplete();
          }}
          onResult={(delta) => {
            setGameScore((prev) => Math.max(0, prev + delta));
          }}
        />
      </div>
    ),
    [role, setDismissedGames, setGameScore]
  );

  return {
    renderCard,
    renderMiniGame,
    renderCardForDeck,
    renderMiniGameForDeck,
  };
}
