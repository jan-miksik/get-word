'use client';

import { useEffect } from 'react';
import type { LearningRole } from '@/features/learning/state/learningRole';
import type { MiniGameConfig } from '@/features/learning/minigames';
import { MiniGameCard } from '@/features/learning/components/MiniGameCard';

/**
 * A block of rounds played on top of a finished day, then straight back to the
 * card that closed it.
 *
 * Every round is an ordinary `MiniGameCard` — the same component the study
 * stream injects — so no exercise is implemented twice. What is deliberately
 * missing is everything that makes a study session one: no progress is written,
 * no spaced-repetition stage moves, no session plan is consulted. Leaving
 * halfway through therefore costs the learner nothing.
 *
 * It is drawn as an ordinary session too. The round sits in the deck's own
 * viewport, on the same sand and without a frame around it, and what keeps
 * count is `QuickPracticeRail` at the study area's edge — the same hairline the
 * session draws. A bonus block is the same activity as the day it follows, so
 * it must not arrive in a dialect of its own: no banner, no framed card, no
 * second progress bar stacked over the round.
 */
export function QuickPracticeRun({
  rounds,
  index,
  role,
  onAdvance,
  onFinish,
}: {
  /** The block, built and frozen by the caller before the run opened. */
  rounds: MiniGameConfig[];
  /** Which round is on screen; the rail outside this panel draws the same. */
  index: number;
  role: LearningRole;
  /** This round is done — move to the next, or end the block. */
  onAdvance: () => void;
  onFinish: () => void;
}) {
  const round = rounds[index];

  // Nothing playable — the block was emptied underneath the run. Hand the
  // learner back rather than show an empty screen; in an effect, because
  // finishing is the caller's state, not ours.
  useEffect(() => {
    if (!round) onFinish();
  }, [onFinish, round]);

  if (!round) return null;

  return (
    <div className="learning-card-viewport relative mx-auto flex h-full w-full flex-col gap-2">
      <div className="min-h-0 flex-1">
        <MiniGameCard
          key={round.id}
          config={round}
          role={role}
          onDismiss={onAdvance}
          // Every card here is a round, so none of them is a visitor: they sit
          // on the sand like the study cards the day was made of, rather than
          // each arriving in a frame of its own.
          frameless
          isActive
        />
      </div>
    </div>
  );
}
