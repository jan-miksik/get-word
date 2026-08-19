'use client';

import { useState } from 'react';
import type { NormalizedWord } from '@/lib/words';
import type { ProgressData } from '@/features/sync/contracts';
import type { LearningRole } from '@/features/learning/state/learningRole';
import type { ResolvedExercise } from '@/features/learning/fine-tune/types';
import { WordCard } from './WordCard';
import { TypingStudyCard, type TypingOutcome } from './TypingStudyCard';
import { MultipleChoiceGame } from './games/MultipleChoiceGame';
import { knownSideForRole, learningSideForRole } from './games/types';

/**
 * How a review turned out, whichever exercise produced it.
 *   known   — right first time, move the word up a stage
 *   stay    — right but scaffolded (a hint, a near-miss), repeat at this stage
 *   unknown — wrong, move the word down a stage
 */
type ExerciseOutcome = TypingOutcome;

export interface StudyExerciseCardProps {
  word: NormalizedWord;
  progress: ProgressData;
  role: LearningRole;
  /** Already resolved and locked for this appearance; see useExerciseResolver. */
  exercise: ResolvedExercise;
  showAll: boolean;
  memoryHook: string;
  suggestedHook: string;
  onMemoryHookChange: (hook: string) => void;
  showMemoryHook: boolean;
  onKnown: () => void;
  onReallyKnown: () => void;
  onUnknown: () => void;
  onCustomStage: (stageIndex: number, opts?: { noRepeat?: boolean }) => void;
  onScore: (points: number) => void;
  onOutcome: (outcome: ExerciseOutcome) => void;
  isMoved?: boolean;
  showEnglish: boolean;
  showCategoryBadges: boolean;
  showPronunciation: boolean;
  categoryOrder: string[];
  studyNotesEnabled: boolean;
  studyNoteMinimizeFromStage: number;
  typingPrefillPunctuation: boolean;
  typingPlayAudioAfterCheck: boolean;
  typingCheckButtonEnabled: boolean;
  fullscreen?: boolean;
  autoFocus?: boolean;
  autoFocusOnMobile?: boolean;
  mobileCustomActionOnly?: boolean;
}

/**
 * Picks the exercise for one word and renders it. This is where "the card is
 * the exercise" actually happens: reveal, multiple choice and typing are three
 * shapes of the same review, and all three move the spaced-repetition stage.
 */
export function StudyExerciseCard({
  word,
  progress,
  role,
  exercise,
  showAll,
  memoryHook,
  suggestedHook,
  onMemoryHookChange,
  showMemoryHook,
  onKnown,
  onReallyKnown,
  onUnknown,
  onCustomStage,
  onScore,
  onOutcome,
  isMoved,
  showEnglish,
  showCategoryBadges,
  showPronunciation,
  categoryOrder,
  studyNotesEnabled,
  studyNoteMinimizeFromStage,
  typingPrefillPunctuation,
  typingPlayAudioAfterCheck,
  typingCheckButtonEnabled,
  fullscreen,
  autoFocus,
  autoFocusOnMobile,
  mobileCustomActionOnly,
}: StudyExerciseCardProps) {
  if (exercise.method === 'typing') {
    return (
      <TypingStudyCard
        word={word}
        progress={progress}
        role={role}
        variant={exercise.variant}
        audioPromptEnabled={false}
        prefillPunctuation={typingPrefillPunctuation}
        playAudioAfterCheck={typingPlayAudioAfterCheck}
        checkButtonEnabled={typingCheckButtonEnabled}
        onScore={onScore}
        onOutcome={onOutcome}
        onCustomStage={onCustomStage}
        memoryHook={memoryHook}
        suggestedHook={suggestedHook}
        onMemoryHookChange={onMemoryHookChange}
        showMemoryHook={showMemoryHook}
        fullscreen={fullscreen}
        autoFocus={autoFocus}
        autoFocusOnMobile={autoFocusOnMobile}
      />
    );
  }

  if (exercise.method === 'choice') {
    return (
      <ChoiceExercise
        word={word}
        role={role}
        exercise={exercise}
        onScore={onScore}
        onOutcome={onOutcome}
      />
    );
  }

  return (
    <WordCard
      word={word}
      progress={progress}
      role={role}
      // The reveal variant decides which side is covered, so the per-appearance
      // coin flip in getWordDisplayMode no longer gets a say here.
      modeIndex={exercise.variant === 'foreign' ? 1 : 0}
      showAll={showAll}
      memoryHook={memoryHook}
      suggestedHook={suggestedHook}
      onKnown={onKnown}
      onReallyKnown={onReallyKnown}
      onCustomStage={onCustomStage}
      onUnknown={onUnknown}
      onMemoryHookChange={onMemoryHookChange}
      isMoved={isMoved}
      showEnglish={showEnglish}
      showCategoryBadges={showCategoryBadges}
      showPronunciation={showPronunciation}
      categoryOrder={categoryOrder}
      showMemoryHook={showMemoryHook}
      studyNotesEnabled={studyNotesEnabled}
      studyNoteMinimizeFromStage={studyNoteMinimizeFromStage}
      mobileCustomActionOnly={mobileCustomActionOnly}
      fullscreen={fullscreen}
    />
  );
}

/**
 * Multiple choice standing in for a study card: frameless, and reporting a
 * review outcome once the learner has seen whether they were right.
 */
function ChoiceExercise({
  word,
  role,
  exercise,
  onScore,
  onOutcome,
}: {
  word: NormalizedWord;
  role: LearningRole;
  exercise: Extract<ResolvedExercise, { method: 'choice' }>;
  onScore: (points: number) => void;
  onOutcome: (outcome: ExerciseOutcome) => void;
}) {
  const [answered, setAnswered] = useState<ExerciseOutcome | null>(null);

  // Asking in the harder direction — known word shown, foreign options to pick
  // from — is what a longer interval deserves; the easier direction stays for
  // the shorter ones. Reuse the reveal notion of "foreign shown" via the band:
  // extreme-band rounds compare foreign spellings, which only works when the
  // options are the foreign side.
  const promptSide =
    exercise.effectiveBand === 'III' ? knownSideForRole(role) : learningSideForRole(role);

  return (
    <div className="flex h-full flex-col justify-center">
      <MultipleChoiceGame
        key={`${word.id}:${exercise.variant}`}
        words={[word, ...exercise.distractors]}
        role={role}
        sourceLang={promptSide}
        promptMode="text"
        soundEnabled
        level={exercise.effectiveBand === 'I' ? 1 : 2}
        frameless
        onResult={(delta) => onScore(Math.max(0, delta))}
        onOutcome={(outcome) => setAnswered(outcome)}
      />
      {answered && (
        <button
          type="button"
          className="mt-4 self-center rounded-xl border-2 border-[#1E6FA8] bg-[#1E6FA8] px-6 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[#F4EFE2] transition-colors hover:bg-[#17608f]"
          onClick={() => onOutcome(answered)}
        >
          →
        </button>
      )}
    </div>
  );
}
