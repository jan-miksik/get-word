import { adjustNewTargetForBacklog, resolveGoalTargets } from './calibration';
import type { StudyGoalConfig } from './goal';

export interface ReviewLoadSimulationInput {
  goal: Pick<StudyGoalConfig, 'mode' | 'minutesPerDay' | 'wordsPerDay' | 'newWordsPerDay' | 'pacing'>;
  days: number;
  availableNewWords: number;
  dueReviewCount: number;
  seed?: number;
}

export interface ReviewLoadForecastDay {
  day: number;
  availableNewWords: number;
  dueReviewCount: number;
  newTarget: number;
  reviewTarget: number;
  plannedSlots: number;
  /** Includes five-minute returns, unlike `plannedSlots`. */
  answerEvents: number;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

/**
 * Deliberately small, deterministic development model. It owns no database
 * assumptions: eligibility is represented by the two snapshot counts, while
 * goal maths and the backlog brake are the exact shared domain functions.
 */
export function simulateReviewLoad(input: ReviewLoadSimulationInput): ReviewLoadForecastDay[] {
  const random = seededRandom(input.seed ?? 1);
  const targets = resolveGoalTargets(input.goal);
  let available = Math.max(0, Math.round(input.availableNewWords));
  let due = Math.max(0, Math.round(input.dueReviewCount));
  const result: ReviewLoadForecastDay[] = [];
  for (let day = 1; day <= Math.max(0, Math.round(input.days)); day += 1) {
    if (input.goal.mode !== 'words') {
      result.push({ day, availableNewWords: available, dueReviewCount: due, newTarget: 0, reviewTarget: targets.itemBudget, plannedSlots: targets.itemBudget, answerEvents: targets.itemBudget });
      continue;
    }
    const afterBacklog = adjustNewTargetForBacklog(targets.desiredNew, due, targets.itemBudget);
    const newTarget = Math.min(afterBacklog, available);
    // Only the brake transfers capacity. A content shortage does not turn a
    // learner's missing new words into surprise extra review.
    const reviewTarget = Math.min(targets.itemBudget - afterBacklog, due);
    const plannedSlots = newTarget + reviewTarget;

    // Every introduction schedules one in-session five-minute return. A small
    // seeded fraction of old reviews does too, which exposes the distinction
    // between planned unique slots and answer events without pretending this
    // is an empirical population forecast.
    const sameDayReturns = newTarget + Math.round(reviewTarget * (0.08 + random() * 0.08));
    result.push({ day, availableNewWords: available, dueReviewCount: due, newTarget, reviewTarget, plannedSlots, answerEvents: plannedSlots + sameDayReturns });

    available -= newTarget;
    const completedDue = Math.max(0, due - reviewTarget);
    // A deterministic fraction of today's work becomes tomorrow's due load.
    due = completedDue + Math.round((newTarget + reviewTarget) * (0.45 + random() * 0.1));
  }
  return result;
}
