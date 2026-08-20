export const BASE_ITEMS_MIN = 5;
export const BASE_ITEMS_MAX = 120;
export const WORDS_TARGET_SLACK = 1.25;
export const SESSION_ITEMS_MAX = 150;

export type GoalPreset = 'light' | 'medium' | 'intense' | 'custom';
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
  daysPerWeek: number;
  minutesPerDay: number;
  wordsPerDay: number;
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
