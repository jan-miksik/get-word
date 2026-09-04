import type { ProgressData } from '@/features/sync/contracts';
import { localDayKeyAt } from '@/lib/local-day';
import { hasIntroducedWord } from '@/packages/domain/goals/goal';
import type { SessionBlock } from './blocks';
import type { SessionPlan } from './plan';

export function wasIntroducedOnDay(
  entry: ProgressData | undefined,
  dayKey: string,
  timezone: string,
): boolean {
  const timestamp = entry?.introducedAt ?? 0;
  return timestamp > 0 && localDayKeyAt(timestamp, timezone) === dayKey;
}

/**
 * Whether a live word may be rendered under a block's promise to the learner.
 *
 * A reinforcement block is technically stored as `review`, but it may only
 * contain words that the preceding new block has actually introduced. Keeping
 * this rule at the stream boundary prevents a stale plan or a delayed write
 * from ever showing an unseen word below a review label.
 */
export function wordMatchesSessionBlock(
  block: Pick<SessionBlock, 'kind' | 'reinforcement'>,
  progress: ProgressData | undefined,
  hasCommittedPendingAnswer = false,
): boolean {
  const introduced = hasIntroducedWord(progress) || hasCommittedPendingAnswer;
  if (block.reinforcement) return introduced;
  return block.kind === 'review' ? introduced : !introduced;
}

/**
 * A stored plan is a convenience cache, never authority over word history.
 *
 * New-block words already introduced today are legitimate completed work, and
 * reinforcement intentionally points at words that may still be unseen before
 * its preceding block starts. Everything else must still agree with current
 * progress or the plan is rebuilt from the live stream.
 */
export function sessionPlanMatchesProgress(
  plan: SessionPlan,
  progress: Record<string, ProgressData>,
  dayKey: string,
  timezone: string,
): boolean {
  return plan.blocks.every((block) => {
    if (block.reinforcement) return true;
    return block.ids.every((id) => {
      const entry = progress[id];
      if (block.kind === 'review') return hasIntroducedWord(entry);
      return !hasIntroducedWord(entry) || wasIntroducedOnDay(entry, dayKey, timezone);
    });
  });
}
