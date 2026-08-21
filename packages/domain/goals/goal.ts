export const BASE_ITEMS_MIN = 5;
export const BASE_ITEMS_MAX = 120;
export const WORDS_TARGET_SLACK = 1.25;
export const SESSION_ITEMS_MAX = 150;
/** A words goal is intentionally conservative: it describes new material. */
export const MAX_NEW_WORD_GOAL = 30;

export type GoalPreset = 'light' | 'medium' | 'intense' | 'custom';
export type GoalMode = 'words' | 'minutes';
export type GoalRevealMode = 'scratch' | 'press';
export type GoalMinigameFrequency = 'off' | { min: number; max: number };

/**
 * Deliberately structural: the domain package stays independent from the
 * learning feature while still preserving the Fine Tune configuration in a
 * goal-version snapshot.
 */
export interface GoalFineTuneConfig {
  version: 3;
  stages: Array<{
    reveal: { weight: number; variants: string[] };
    choice: { weight: number; variants: string[] };
    typing: { weight: number; variants: string[] };
    assembly: { weight: number; variants: string[] };
  }>;
}

export interface StudyPacing {
  revealMode: GoalRevealMode;
  minigameFrequency: GoalMinigameFrequency;
  fineTune: GoalFineTuneConfig;
}

export interface StudyGoalConfig {
  enabled: boolean;
  mode: GoalMode;
  daysPerWeek: number;
  /** Resolved for display; canonical only when mode is `minutes`. */
  minutesPerDay: number;
  /** Resolved for display; canonical only when mode is `words`. */
  wordsPerDay: number;
  /** Canonical only when mode is `words`. */
  newWordsPerDay: number | null;
  preset: GoalPreset;
  pacing: StudyPacing;
}

export interface StudyGoalVersion extends StudyGoalConfig {
  id: string;
  effectiveFromDay: string;
  createdAt?: string;
}

export interface StudyGoalState {
  active: StudyGoalVersion | null;
  pending: StudyGoalVersion | null;
  revision: number;
}

export function hasStudyGoal(goal: Pick<StudyGoalConfig, 'enabled'> | null | undefined): boolean {
  return goal?.enabled === true;
}

export function clampGoalDays(value: number): number {
  return Math.max(1, Math.min(7, Math.round(value)));
}

export function clampGoalMinutes(value: number): number {
  return Math.max(1, Math.min(240, Math.round(value)));
}

export function clampGoalWords(value: number): number {
  return Math.max(1, Math.min(MAX_NEW_WORD_GOAL, Math.round(value)));
}

/** A stage is not an introduction state: forgotten words can return to stage 0. */
export function hasIntroducedWord(progress: { introducedAt?: number | Date | null; knownCount?: number; unknownCount?: number; stageIndex?: number } | null | undefined): boolean {
  if (!progress) return false;
  if (progress.introducedAt instanceof Date && Number.isFinite(progress.introducedAt.getTime())) return true;
  if (typeof progress.introducedAt === 'number' && progress.introducedAt > 0) return true;
  return (progress.knownCount ?? 0) + (progress.unknownCount ?? 0) > 0 || (progress.stageIndex ?? 0) > 0;
}
