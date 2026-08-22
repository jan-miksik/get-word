import { simulateReviewLoad, type ReviewLoadDay, type ReviewLoadInput } from './forecast';

export type LearnerArchetypeId = 'drifter' | 'wobbler' | 'steady' | 'returner' | 'daily';

export interface LearnerArchetype {
  id: LearnerArchetypeId;
  /** Learners in a hundred this pattern is meant to stand for. */
  share: number;
  /** Days a week actually studied, in a week that is not skipped entirely. */
  daysPerWeek: number;
  successRate: number;
  /** Whether the learner opens the app on this day at all. */
  studyDayPattern: (dayIndex: number) => boolean;
}

interface PatternShape {
  daysPerWeek: number;
  /** One week in every `skipEveryNthWeek` is missed. `null` for none. */
  skipEveryNthWeek: number | null;
  /** The learner stops opening the app after this many days. */
  quitAfterDays?: number;
  /** A recurring continuous absence — a holiday, an exam period, life. */
  absence?: { cycleDays: number; startDay: number; lengthDays: number };
}

/**
 * Spreads `daysPerWeek` study days evenly across the week rather than stacking
 * them at the front, so a three-day learner gets gaps between sessions the way
 * a real one does — which matters, because the one-day and three-day intervals
 * are exactly the scale those gaps land on.
 */
function studiesOnWeekday(dayInWeek: number, daysPerWeek: number): boolean {
  return Math.floor(((dayInWeek + 1) * daysPerWeek) / 7) > Math.floor((dayInWeek * daysPerWeek) / 7);
}

function weeklyPattern(shape: PatternShape): (dayIndex: number) => boolean {
  return (dayIndex) => {
    if (shape.quitAfterDays !== undefined && dayIndex >= shape.quitAfterDays) return false;
    if (shape.absence) {
      const phase = dayIndex % shape.absence.cycleDays;
      if (phase >= shape.absence.startDay && phase < shape.absence.startDay + shape.absence.lengthDays) {
        return false;
      }
    }
    if (shape.skipEveryNthWeek !== null) {
      const week = Math.floor(dayIndex / 7);
      if (week % shape.skipEveryNthWeek === shape.skipEveryNthWeek - 1) return false;
    }
    return studiesOnWeekday(dayIndex % 7, shape.daysPerWeek);
  };
}

/**
 * A deliberately coarse picture of who sets a goal.
 *
 * The shares are an estimate, not a measurement — they exist so a question like
 * "what does ten new words a day do to the average learner after a year" has an
 * answer with a shape, and so the tail cases (the one in a hundred who really
 * does study daily) are not mistaken for the norm. Nothing in the product reads
 * these; they drive the development forecast only.
 */
export const LEARNER_ARCHETYPES: LearnerArchetype[] = [
  {
    id: 'drifter', share: 54, daysPerWeek: 2, successRate: 0.6,
    studyDayPattern: weeklyPattern({ daysPerWeek: 2, skipEveryNthWeek: 3, quitAfterDays: 21 }),
  },
  {
    id: 'wobbler', share: 30, daysPerWeek: 3, successRate: 0.65,
    studyDayPattern: weeklyPattern({ daysPerWeek: 3, skipEveryNthWeek: 4 }),
  },
  {
    id: 'steady', share: 10, daysPerWeek: 5, successRate: 0.7,
    studyDayPattern: weeklyPattern({ daysPerWeek: 5, skipEveryNthWeek: 10 }),
  },
  {
    id: 'returner', share: 5, daysPerWeek: 4, successRate: 0.65,
    studyDayPattern: weeklyPattern({
      daysPerWeek: 4, skipEveryNthWeek: null,
      absence: { cycleDays: 120, startDay: 45, lengthDays: 30 },
    }),
  },
  {
    id: 'daily', share: 1, daysPerWeek: 7, successRate: 0.75,
    studyDayPattern: weeklyPattern({ daysPerWeek: 7, skipEveryNthWeek: null }),
  },
];

export const ARCHETYPE_SLICE_DAYS = [30, 90, 365] as const;
/** Rates are read off a trailing fortnight; a lifetime average hides the trend. */
const TRAILING_WINDOW_DAYS = 14;

export interface ArchetypeSlice {
  day: number;
  studyDays: number;
  /** Averages over the *studied* days in the trailing window; 0 if there were none. */
  reviewsPerStudyDay: number;
  minutesPerStudyDay: number;
  introducedEver: number;
  matureWords: number;
  backlog: number;
  peakBacklog: number;
}

export interface ArchetypeSummary {
  archetype: LearnerArchetype;
  days: ReviewLoadDay[];
  slices: ArchetypeSlice[];
}

function sliceAt(days: ReviewLoadDay[], day: number): ArchetypeSlice {
  const upTo = days.slice(0, day);
  const last = upTo.at(-1);
  const window = upTo.slice(-TRAILING_WINDOW_DAYS).filter((entry) => entry.studied);
  const mean = (pick: (entry: ReviewLoadDay) => number) =>
    window.length === 0 ? 0 : window.reduce((sum, entry) => sum + pick(entry), 0) / window.length;
  return {
    day,
    studyDays: upTo.filter((entry) => entry.studied).length,
    reviewsPerStudyDay: mean((entry) => entry.reviewsDone),
    minutesPerStudyDay: mean((entry) => entry.estimatedMinutes),
    introducedEver: last?.introducedEver ?? 0,
    matureWords: last?.matureWords ?? 0,
    backlog: last?.backlog ?? 0,
    peakBacklog: upTo.reduce((peak, entry) => Math.max(peak, entry.backlog), 0),
  };
}

/**
 * Runs one archetype against a goal and reads off the three horizons. The goal
 * is the *same* goal for everyone: the point is what different habits do to one
 * setting, not what different settings do.
 */
export function summarizeArchetype(
  archetype: LearnerArchetype,
  goal: ReviewLoadInput['goal'],
  options: { wordPoolSize: number; days?: number; successRate?: number },
): ArchetypeSummary {
  const days = options.days ?? ARCHETYPE_SLICE_DAYS[ARCHETYPE_SLICE_DAYS.length - 1];
  const simulated = simulateReviewLoad({
    goal,
    days,
    wordPoolSize: options.wordPoolSize,
    successRate: options.successRate ?? archetype.successRate,
    studyDayPattern: archetype.studyDayPattern,
  });
  return {
    archetype,
    days: simulated,
    slices: ARCHETYPE_SLICE_DAYS.filter((sliceDay) => sliceDay <= days)
      .map((sliceDay) => sliceAt(simulated, sliceDay)),
  };
}

export function summarizeAllArchetypes(
  goal: ReviewLoadInput['goal'],
  options: { wordPoolSize: number; days?: number },
): ArchetypeSummary[] {
  return LEARNER_ARCHETYPES.map((archetype) => summarizeArchetype(archetype, goal, options));
}
