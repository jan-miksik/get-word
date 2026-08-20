'use client';

import { useCallback, useRef } from 'react';
import { MiniGameCard } from '@/features/learning/components/MiniGameCard';
import type { TypingOutcome } from '@/features/learning/components/TypingStudyCard';
import { StudyExerciseCard } from '@/features/learning/components/StudyExerciseCard';
import type { FineTuneConfig } from '@/features/learning/fine-tune/types';
import { useExerciseResolver } from './useExerciseResolver';
import type { ProgressData } from '@/features/sync/contracts';
import type { MiniGameConfig } from '@/features/learning/minigames';
import type { NormalizedWord } from '@/lib/words';
import type { LearningRole } from '@/features/learning/state/learningRole';

const isMobileLayout = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(max-width: 767px)').matches === true;

interface UseLearningRenderersOptions {
  progress: Record<string, ProgressData>;
  role: LearningRole;
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
  fineTuneConfig: FineTuneConfig;
  /** Every word in the current study set, used to draw quiz distractors from. */
  distractorPool: NormalizedWord[];
  typingPrefillPunctuation: boolean;
  typingMobileKeyboardAutoFocus: boolean;
  typingPlayAudioAfterCheck: boolean;
  typingCheckButtonEnabled: boolean;
  dismissedGames: Set<string>;
  setDismissedGames: React.Dispatch<React.SetStateAction<Set<string>>>;
  setGameScore: React.Dispatch<React.SetStateAction<number>>;
  onAddSimilarWords: () => void;
  similarWordsContext?: {
    pool: NormalizedWord[];
    languageFrom: string;
    languageTo: string;
    baseListId: string | null;
    onSaved?: () => void | Promise<void>;
  };
}

export function useLearningRenderers({
  progress,
  role,
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
  fineTuneConfig,
  distractorPool,
  typingPrefillPunctuation,
  typingMobileKeyboardAutoFocus,
  typingPlayAudioAfterCheck,
  typingCheckButtonEnabled,
  dismissedGames,
  setDismissedGames,
  setGameScore,
  onAddSimilarWords,
  similarWordsContext,
}: UseLearningRenderersOptions) {
  const lockedDeckCardStateRef = useRef<Map<string, { progress: ProgressData }>>(new Map());

  const resolveExercise = useExerciseResolver(fineTuneConfig, distractorPool, role);

  // Every exercise — reveal, choice or typing — feeds the same spaced-repetition
  // stages: a clean success advances, a hinted or near answer reschedules at the
  // same stage, and a failure steps the word down.
  // Score lands as soon as the answer is checked; the SR stage moves only when
  // the card advances (continue tap), so the two are wired separately.
  const applyExerciseScore = useCallback(
    (points: number) => {
      if (points > 0) setGameScore((prev) => Math.max(0, prev + points));
    },
    [setGameScore]
  );

  const applyExerciseOutcome = useCallback(
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
    return (
      <div key={word.id} className="pt-8">
        <StudyExerciseCard
          word={word}
          progress={prog}
          role={role}
          exercise={resolveExercise(word, prog)}
          showAll={showAll}
          memoryHook={getMemoryHook(word)}
          suggestedHook={getSuggestedMemoryHook(word)}
          onMemoryHookChange={(hook) => setMemoryHook(word, hook)}
          showMemoryHook={shouldRenderMemoryHook(word.id)}
          onKnown={() => markKnown(word.id)}
          onReallyKnown={() => markReallyKnown(word.id)}
          onUnknown={() => markUnknown(word.id)}
          onCustomStage={(stageIndex, opts) => setCustomStage(word.id, stageIndex, opts)}
          onScore={applyExerciseScore}
          onOutcome={(outcome) => applyExerciseOutcome(word.id, prog.stageIndex, outcome)}
          isMoved={lastMovedId === word.id}
          showEnglish={showEnglish}
          showCategoryBadges={showCategoryBadges}
          showPronunciation={showPronunciation}
          categoryOrder={categoryOrder}
          studyNotesEnabled={studyNotesEnabled}
          studyNoteMinimizeFromStage={studyNoteMinimizeFromStage}
          typingPrefillPunctuation={typingPrefillPunctuation}
          typingPlayAudioAfterCheck={typingPlayAudioAfterCheck}
          typingCheckButtonEnabled={typingCheckButtonEnabled}
        />
      </div>
    );
  }, [progress, role, resolveExercise, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setCustomStage, setMemoryHook, lastMovedId, showEnglish, showCategoryBadges, showPronunciation, categoryOrder, shouldRenderMemoryHook, studyNotesEnabled, studyNoteMinimizeFromStage, typingPrefillPunctuation, typingPlayAudioAfterCheck, typingCheckButtonEnabled, applyExerciseScore, applyExerciseOutcome]);

  const renderMiniGame = useCallback((config: MiniGameConfig, isActive = false) => {
    if (dismissedGames.has(config.id)) return null;
    return (
      <div key={config.id} className="pt-8 h-full min-h-0 flex flex-col">
        <div className="flex-1 min-h-0">
          <MiniGameCard
            config={config}
            role={role}
            onDismiss={() => setDismissedGames((prev) => new Set([...prev, config.id]))}
            onResult={(delta) => setGameScore((prev) => Math.max(0, prev + delta))}
            onReviewOutcome={(wordId, outcome) => {
              const stageIndex = progress[wordId]?.stageIndex ?? 0;
              applyExerciseOutcome(wordId, stageIndex, outcome);
            }}
            onAddSimilarWords={onAddSimilarWords}
            similarWordsContext={similarWordsContext}
            isActive={isActive}
          />
        </div>
      </div>
    );
  }, [dismissedGames, role, setDismissedGames, setGameScore, progress, applyExerciseOutcome, onAddSimilarWords, similarWordsContext]);

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
      const isExiting = opts?.isExiting ?? false;
      // While a card animates out it must keep showing the answer the learner
      // just gave, not the progress the answer produced.
      const locked = lockedDeckCardStateRef.current.get(word.id);
      if (isExiting) {
        if (!locked) lockedDeckCardStateRef.current.set(word.id, { progress: liveProg });
      } else if (locked) {
        lockedDeckCardStateRef.current.delete(word.id);
      }
      const prog = (isExiting ? lockedDeckCardStateRef.current.get(word.id)?.progress : null) ?? liveProg;
      const exercise = resolveExercise(word, prog);
      // iOS only raises the keyboard reliably while the Continue tap is still
      // active, so a typing round on mobile skips the deck exit animation.
      const skipAnimation =
        exercise.method === 'typing' && typingMobileKeyboardAutoFocus && isMobileLayout();

      return (
        <div key={word.id} className="h-full flex flex-col justify-end md:justify-start relative">
          <StudyExerciseCard
            word={word}
            progress={prog}
            role={role}
            exercise={exercise}
            showAll={showAll}
            memoryHook={getMemoryHook(word)}
            suggestedHook={getSuggestedMemoryHook(word)}
            onMemoryHookChange={(hook) => setMemoryHook(word, hook)}
            showMemoryHook={shouldRenderMemoryHook(word.id)}
            onKnown={() => { onComplete(() => markKnown(word.id)); }}
            onReallyKnown={() => { onComplete(() => markReallyKnown(word.id)); }}
            onUnknown={() => { onComplete(() => markUnknown(word.id)); }}
            onCustomStage={(stageIndex, options) => {
              onComplete(() => setCustomStage(word.id, stageIndex, options), { skipAnimation });
            }}
            onScore={applyExerciseScore}
            onOutcome={(outcome) => {
              onComplete(
                () => applyExerciseOutcome(word.id, prog.stageIndex, outcome),
                { skipAnimation },
              );
            }}
            showEnglish={showEnglish}
            showCategoryBadges={showCategoryBadges}
            showPronunciation={showPronunciation}
            categoryOrder={categoryOrder}
            studyNotesEnabled={studyNotesEnabled}
            studyNoteMinimizeFromStage={studyNoteMinimizeFromStage}
            typingPrefillPunctuation={typingPrefillPunctuation}
            typingPlayAudioAfterCheck={typingPlayAudioAfterCheck}
            typingCheckButtonEnabled={typingCheckButtonEnabled}
            mobileCustomActionOnly={swipeCardsEnabled}
            fullscreen
            autoFocus={!isExiting}
            autoFocusOnMobile={typingMobileKeyboardAutoFocus}
          />
        </div>
      );
    },
    [progress, role, resolveExercise, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setCustomStage, setMemoryHook, showEnglish, showCategoryBadges, showPronunciation, categoryOrder, shouldRenderMemoryHook, studyNotesEnabled, studyNoteMinimizeFromStage, swipeCardsEnabled, typingPrefillPunctuation, typingMobileKeyboardAutoFocus, typingPlayAudioAfterCheck, typingCheckButtonEnabled, applyExerciseScore, applyExerciseOutcome]
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
          onReviewOutcome={(wordId, outcome) => {
            const stageIndex = progress[wordId]?.stageIndex ?? 0;
            applyExerciseOutcome(wordId, stageIndex, outcome);
          }}
          onAddSimilarWords={onAddSimilarWords}
          similarWordsContext={similarWordsContext}
          isActive
        />
      </div>
    ),
    [role, setDismissedGames, setGameScore, progress, applyExerciseOutcome, onAddSimilarWords, similarWordsContext]
  );

  // Typing raises the mobile keyboard, and a vertical drag with the keyboard up
  // can discard a word by accident. Typing is per-stage now rather than a global
  // mode, so the deck has to ask card by card instead of once for the session.
  const isTypingCard = useCallback(
    (wordId: string) => {
      const word = distractorPool.find((entry) => entry.id === wordId);
      if (!word) return false;
      const prog = progress[wordId] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
      return resolveExercise(word, prog).method === 'typing';
    },
    [distractorPool, progress, resolveExercise],
  );

  return {
    renderCard,
    renderMiniGame,
    renderCardForDeck,
    renderMiniGameForDeck,
    isTypingCard,
  };
}
