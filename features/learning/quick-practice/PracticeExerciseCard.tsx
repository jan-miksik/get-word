'use client';

import type { ProgressData } from '@/features/sync/contracts';
import type { LearningRole } from '@/features/learning/state/learningRole';
import { StudyExerciseCard } from '@/features/learning/components/StudyExerciseCard';
import { DEFAULT_TYPING_AUDIO_REPLAY_HIDE_FROM_STAGE } from '@/lib/words';
import type { PracticeStep } from './rounds';

/**
 * The display settings a practice card borrows from the learner's session.
 *
 * All optional: the preview and the tests render practice cards with none of
 * them, and a missing setting simply falls back to the plainest card. What a
 * practice card must never borrow is anything that *writes* — that is the whole
 * distinction the block rests on.
 */
export interface PracticeCardSettings {
  /** Real progress, for the stage badge only; nothing here writes to it. */
  progress?: Record<string, ProgressData>;
  showEnglish?: boolean;
  showCategoryBadges?: boolean;
  showPronunciation?: boolean;
  categoryOrder?: string[];
  studyNotesEnabled?: boolean;
  studyNoteMinimizeFromStage?: number;
  typingPrefillPunctuation?: boolean;
  typingCheckButtonEnabled?: boolean;
  typingAudioReplayHideFromStage?: number;
}

const NEW_WORD_PROGRESS: ProgressData = { stageIndex: 0, knownCount: 0, unknownCount: 0 };

const noop = () => {};

/**
 * One single-word card of a practice block: the study card the day is made of,
 * with everything that moves a spaced-repetition stage taken off it.
 *
 * Reveal, choice, typing and assembly all arrive here — the same four the
 * ladder deals during a session, and the same components — so a practice block
 * looks and reads like the day it follows rather than like a separate game.
 */
export function PracticeExerciseCard({
  step,
  role,
  settings,
  onAdvance,
  onScore,
}: {
  step: Extract<PracticeStep, { kind: 'exercise' }>;
  role: LearningRole;
  settings?: PracticeCardSettings;
  /** This card is done — the block moves on. */
  onAdvance: () => void;
  /**
   * A correct answer here still earns its point. Practice writes no
   * spaced-repetition stage, but the score is not stage state — it is what the
   * learner sees for answering well, and a bonus block that answers back with
   * nothing reads as the answer having gone unnoticed.
   */
  onScore?: (points: number) => void;
}) {
  const progress = settings?.progress?.[step.word.id] ?? NEW_WORD_PROGRESS;

  return (
    <StudyExerciseCard
      key={step.id}
      word={step.word}
      progress={progress}
      role={role}
      exercise={step.exercise}
      practice
      // Practice lives in the same full-height viewport as the study deck.
      // This supplies its bounded width, vertical composition and paper ink.
      fullscreen
      showAll={false}
      memoryHook=""
      suggestedHook=""
      onMemoryHookChange={noop}
      showMemoryHook={false}
      // Every one of these is an SRS action on an ordinary card. Here they are
      // unreachable — the reveal shows a continue instead of a verdict, and the
      // retire offer and the stage popover are both off — so they exist only to
      // satisfy the card's contract.
      onKnown={noop}
      onReallyKnown={noop}
      onUnknown={noop}
      onCustomStage={noop}
      onScore={onScore ?? noop}
      // The one live wire: whatever the exercise reports, the block advances.
      onOutcome={onAdvance}
      showEnglish={settings?.showEnglish ?? false}
      showCategoryBadges={settings?.showCategoryBadges ?? false}
      showPronunciation={settings?.showPronunciation ?? false}
      categoryOrder={settings?.categoryOrder ?? []}
      studyNotesEnabled={settings?.studyNotesEnabled ?? false}
      studyNoteMinimizeFromStage={settings?.studyNoteMinimizeFromStage ?? 0}
      typingPrefillPunctuation={settings?.typingPrefillPunctuation ?? false}
      typingCheckButtonEnabled={settings?.typingCheckButtonEnabled ?? true}
      typingAudioReplayHideFromStage={
        settings?.typingAudioReplayHideFromStage ?? DEFAULT_TYPING_AUDIO_REPLAY_HIDE_FROM_STAGE
      }
    />
  );
}
