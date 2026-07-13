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
  typingAudioPromptEnabled: boolean;
  typingPrefillPunctuation: boolean;
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
  typingAudioPromptEnabled,
  typingPrefillPunctuation,
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
  const applyTypingOutcome = useCallback(
    (wordId: string, stageIndex: number, outcome: TypingOutcome, points: number) => {
      if (points > 0) setGameScore((prev) => Math.max(0, prev + points));
      if (outcome === 'known') markKnown(wordId);
      else if (outcome === 'unknown') markUnknown(wordId);
      else setCustomStage(wordId, stageIndex);
    },
    [markKnown, markUnknown, setCustomStage, setGameScore]
  );

  const renderCard = useCallback((word: NormalizedWord, _stageIndex?: number) => {
    const prog = progress[word.id] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
    if (typingModeEnabled) {
      return (
        <div key={word.id} className="pt-8">
          <TypingStudyCard
            word={word}
            progress={prog}
            role={role}
            writeIn={typingWriteIn}
            audioPromptEnabled={typingAudioPromptEnabled}
            prefillPunctuation={typingPrefillPunctuation}
            modeIndex={getWordDisplayMode(word.id)}
            onOutcome={(outcome, points) =>
              applyTypingOutcome(word.id, prog.stageIndex, outcome, points)
            }
            onCustomStage={(stageIndex, opts) => setCustomStage(word.id, stageIndex, opts)}
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
  }, [progress, role, getWordDisplayMode, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setCustomStage, setMemoryHook, lastMovedId, showEnglish, showCategoryBadges, showPronunciation, categoryOrder, shouldRenderMemoryHook, studyNotesEnabled, studyNoteMinimizeFromStage, typingModeEnabled, typingWriteIn, typingAudioPromptEnabled, typingPrefillPunctuation, applyTypingOutcome]);

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
      onComplete: (afterExit?: () => void) => void,
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
              audioPromptEnabled={typingAudioPromptEnabled}
              prefillPunctuation={typingPrefillPunctuation}
              modeIndex={modeIndex as 0 | 1}
              onOutcome={(outcome, points) => {
                onComplete(() =>
                  applyTypingOutcome(word.id, prog.stageIndex, outcome, points)
                );
              }}
              onCustomStage={(stageIndex, opts) => {
                onComplete(() => setCustomStage(word.id, stageIndex, opts));
              }}
              fullscreen
              autoFocus={!isExiting}
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
    [progress, role, getWordDisplayMode, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setCustomStage, setMemoryHook, showEnglish, showCategoryBadges, showPronunciation, categoryOrder, shouldRenderMemoryHook, studyNotesEnabled, studyNoteMinimizeFromStage, swipeCardsEnabled, typingModeEnabled, typingWriteIn, typingAudioPromptEnabled, typingPrefillPunctuation, applyTypingOutcome]
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
