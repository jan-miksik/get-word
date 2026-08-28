'use client';

import { useState } from 'react';
import type { NormalizedWord } from '@/lib/words';
import type { ProgressData } from '@/features/sync/contracts';
import type { LearningRole } from '@/features/learning/state/learningRole';
import type { ResolvedExercise } from '@/features/learning/fine-tune/types';
import { WordCard } from './WordCard';
import { readCardSoundEnabled } from './card-audio/cardSound';
import { TypingStudyCard, type TypingOutcome } from './TypingStudyCard';
import { MultipleChoiceGame } from './games/MultipleChoiceGame';
import { WordAssemblyGame } from './games/WordAssemblyGame';
import { ContinueButton } from './ContinueButton';
import { knownSideForRole, learningSideForRole } from './games/types';
import {
  FullyKnownOffer,
  TOP_STAGE_INDEX,
  isTopStage,
} from './word-card/FullyKnownOffer';

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
  /**
   * The answer is in — the option picked, the phrase checked — which is a card
   * of progress made whatever the card still has to show before it advances.
   * `onOutcome` stays the moment the review is *committed*, on the continue tap.
   * The reveal card has no gap between the two and so never fires this.
   */
  onAnswered?: () => void;
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
 * One appearance of one word. A word can come back inside the same session —
 * the closing block repeats what the new block just introduced — and the round
 * it gets then is a fresh round, not a continuation. Keying the game on this
 * makes the answer count part of its identity, so nothing (a half-built
 * assembly, an already-answered choice) survives from the earlier appearance.
 */
function appearanceKey(word: NormalizedWord, progress: ProgressData, variant: string): string {
  return `${word.id}:${variant}:${(progress.knownCount ?? 0) + (progress.unknownCount ?? 0)}`;
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
  onAnswered,
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
        onAnswered={onAnswered}
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
        key={appearanceKey(word, progress, exercise.variant)}
        word={word}
        role={role}
        exercise={exercise}
        progress={progress}
        onScore={onScore}
        onOutcome={onOutcome}
        onAnswered={onAnswered}
        onCustomStage={onCustomStage}
      />
    );
  }

  if (exercise.method === 'assembly') {
    return (
      <AssemblyExercise
        word={word}
        role={role}
        exercise={exercise}
        progress={progress}
        onOutcome={onOutcome}
        onAnswered={onAnswered}
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

function AssemblyExercise({
  word,
  role,
  exercise,
  progress,
  onOutcome,
  onAnswered,
}: {
  word: NormalizedWord;
  role: LearningRole;
  exercise: Extract<ResolvedExercise, { method: 'assembly' }>;
  progress: ProgressData;
  onOutcome: (outcome: ExerciseOutcome) => void;
  onAnswered?: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center">
      <WordAssemblyGame
        key={appearanceKey(word, progress, exercise.variant)}
        word={word}
        role={role}
        variant={exercise.variant}
        answerParts={exercise.answerParts}
        distractorParts={exercise.distractorParts}
        difficultyBand={exercise.effectiveBand}
        stageIndex={progress.stageIndex}
        onOutcome={onOutcome}
        onAnswered={onAnswered}
      />
    </div>
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
  progress,
  onScore,
  onOutcome,
  onAnswered,
  onCustomStage,
}: {
  word: NormalizedWord;
  role: LearningRole;
  exercise: Extract<ResolvedExercise, { method: 'choice' }>;
  progress: ProgressData;
  onScore: (points: number) => void;
  onOutcome: (outcome: ExerciseOutcome) => void;
  onAnswered?: () => void;
  onCustomStage: (stageIndex: number, opts?: { noRepeat?: boolean }) => void;
}) {
  const [answered, setAnswered] = useState<ExerciseOutcome | null>(null);
  // The same one setting the sound toggle on a minigame card writes: silencing
  // a round there silences the choice study card here too.
  const [soundEnabled] = useState(() => readCardSoundEnabled());
  // Same rule as the reveal and typing cards: a clean answer at 60 days is the
  // moment to offer retirement rather than book another 60 days.
  const showFullyKnownOffer =
    answered === 'known' &&
    isTopStage(progress.stageIndex ?? 0) &&
    Boolean(progress.nextDueAt);

  // The variant fixes which language the options are written in, so the prompt
  // is simply the other side: foreign options mean the learner reads the word
  // they know and has to produce the foreign one, which is the harder way round.
  const promptSide =
    exercise.optionsSide === 'foreign' ? knownSideForRole(role) : learningSideForRole(role);

  return (
    <div className="flex h-full flex-col justify-center">
      <MultipleChoiceGame
        key={appearanceKey(word, progress, exercise.variant)}
        words={[word, ...exercise.distractors]}
        role={role}
        sourceLang={promptSide}
        promptMode="text"
        soundEnabled={soundEnabled}
        level={exercise.effectiveBand === 'I' ? 1 : 2}
        difficultyBand={exercise.effectiveBand}
        stageIndex={progress.stageIndex}
        frameless
        onResult={(delta) => onScore(Math.max(0, delta))}
        onOutcome={(outcome) => {
          setAnswered(outcome);
          onAnswered?.();
        }}
      />
      {/* Keep the post-answer controls in the layout from the first frame. The
          whole exercise is vertically centred, so inserting Continue only
          after a choice used to change the column height and visibly lift the
          prompt and every answer at the exact moment the learner tapped. */}
      <div
        className={`mx-auto mt-4 flex w-full max-w-md flex-col gap-2 ${
          isTopStage(progress.stageIndex ?? 0) && Boolean(progress.nextDueAt)
            ? 'min-h-[6.5rem]'
            : 'min-h-14'
        }`}
        data-choice-action-slot
      >
        {showFullyKnownOffer ? (
          <FullyKnownOffer
            onRetire={() => onCustomStage(TOP_STAGE_INDEX, { noRepeat: true })}
          />
        ) : null}
        {answered ? (
          <ContinueButton
            variant="solid"
            className="self-center max-w-[22rem]"
            onClick={() => onOutcome(answered)}
          />
        ) : null}
      </div>
    </div>
  );
}
