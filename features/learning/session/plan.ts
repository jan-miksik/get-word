import type { ProgressData } from '@/features/sync/contracts';
import type { NormalizedWord } from '@/lib/words';
import type { StudyGoalVersion } from '@/packages/domain/goals/goal';
import { sessionItemCapFromWordGoal } from '@/packages/domain/goals/calibration';
import { planSessionBlocks, type SessionBlock } from './blocks';

export interface SessionPlanInput {
  goal: StudyGoalVersion | null;
  priorityWords: NormalizedWord[];
  dueWords: NormalizedWord[];
  newWords: NormalizedWord[];
  progress: Record<string, ProgressData>;
  absenceDays?: number;
  continueAnyway?: boolean;
}

export interface SessionPlan {
  enabled: boolean;
  sessionItemCap: number | null;
  priorityIds: string[];
  dueIds: string[];
  newIds: string[];
  deferredDueCount: number;
  reason: 'normal' | 'rampUp' | 'unbounded';
  blocks: SessionBlock[];
}

const NEW_SHARE_MIN = 0.2;
const NEW_SHARE_RAMP = 0.3;
const RAMP_AFTER_ABSENCE_DAYS = 7;

function distinct(words: NormalizedWord[], seen = new Set<string>()): NormalizedWord[] {
  return words.filter((word) => !seen.has(word.id) && Boolean(seen.add(word.id)));
}

/** Pure presentation planner: it neither changes SRS progress nor creates rows. */
export function planSession(input: SessionPlanInput): SessionPlan {
  const { goal } = input;
  if (!goal?.enabled || input.continueAnyway) {
    return {
      enabled: Boolean(goal?.enabled), sessionItemCap: null,
      priorityIds: input.priorityWords.map((word) => word.id),
      dueIds: input.dueWords.map((word) => word.id),
      newIds: input.newWords.map((word) => word.id),
      deferredDueCount: 0,
      reason: input.continueAnyway ? 'unbounded' : 'normal',
      blocks: [],
    };
  }
  const rampUp = (input.absenceDays ?? 0) >= RAMP_AFTER_ABSENCE_DAYS;
  // The session is as long as the *time* budget allows, not as long as the
  // word target — see `calculateWordGoal`. `wordsPerDay` stays the alternative
  // finish line for a learner moving faster than the pacing estimate.
  const cap = sessionItemCapFromWordGoal(goal.wordsPerDay);
  const share = rampUp ? NEW_SHARE_RAMP : NEW_SHARE_MIN;
  const allNew = distinct(input.newWords, new Set(input.priorityWords.map((word) => word.id)));
  const priorityNew = input.priorityWords.filter((word) => (input.progress[word.id]?.stageIndex ?? 0) === 0);
  const newFloor = Math.min(allNew.length + priorityNew.length, Math.max(1, Math.ceil(cap * share)));
  const selectedPriority: NormalizedWord[] = [];
  const selectedDue: NormalizedWord[] = [];
  const selectedNew: NormalizedWord[] = [];
  const seen = new Set<string>();
  const add = (word: NormalizedWord, destination: NormalizedWord[]) => {
    if (seen.size >= cap || seen.has(word.id)) return;
    seen.add(word.id); destination.push(word);
  };

  // Reserve the new-word floor first, then fill the familiar priority/due order.
  for (const word of priorityNew) add(word, selectedNew);
  for (const word of allNew) {
    if (selectedNew.length >= newFloor) break;
    add(word, selectedNew);
  }
  for (const word of input.priorityWords) add(word, (input.progress[word.id]?.stageIndex ?? 0) === 0 ? selectedNew : selectedPriority);
  const orderedDue = [...input.dueWords].sort((left, right) => {
    const leftProgress = input.progress[left.id];
    const rightProgress = input.progress[right.id];
    return (leftProgress?.stageIndex ?? 0) - (rightProgress?.stageIndex ?? 0) ||
      (leftProgress?.nextDueAt ?? 0) - (rightProgress?.nextDueAt ?? 0);
  });
  for (const word of orderedDue) add(word, selectedDue);
  for (const word of allNew) add(word, selectedNew);
  const priorityIds = selectedPriority.map((word) => word.id);
  const dueIds = selectedDue.map((word) => word.id);
  const newIds = selectedNew.map((word) => word.id);
  return {
    enabled: true,
    sessionItemCap: cap,
    priorityIds,
    dueIds,
    newIds,
    deferredDueCount: Math.max(0, input.dueWords.length - selectedDue.length),
    reason: rampUp ? 'rampUp' : 'normal',
    blocks: planSessionBlocks([...priorityIds, ...dueIds], newIds, { leadWithNew: rampUp }),
  };
}
