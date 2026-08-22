import { adjustNewTargetForBacklog, estimateSecondsPerItem, resolveGoalTargets } from './calibration';
import type { StudyGoalConfig } from './goal';

/**
 * Stage intervals in days, mirroring `STAGES` in `lib/words.ts`.
 *
 * Declared here rather than imported so the domain package keeps pointing only
 * inwards. `forecast.test.ts` asserts the two lists agree, so drift fails a test
 * rather than quietly skewing a year-long estimate.
 */
export const STAGE_INTERVAL_DAYS = [0, 5 / (60 * 24), 1, 3, 7, 14, 30, 60] as const;
export const MAX_STAGE = STAGE_INTERVAL_DAYS.length - 1;
/** Stage 1 is the five-minute return: due again inside the same session. */
const SAME_DAY_STAGE = 1;
/** Fourteen days and up. What "this one is sticking" means, for reporting only. */
export const MATURE_STAGE = 5;

/**
 * Minutes-mode split, mirroring `NEW_SHARE` / `NEW_MIN` / `NEW_MAX` in
 * `features/learning/session/plan.ts`. Words mode gets its new target straight
 * from `resolveGoalTargets`, so these apply to minutes mode alone.
 */
const NEW_SHARE = 0.3;
const NEW_MIN = 1;
const NEW_MAX = 20;

/** Below this a cohort is a rounding artefact, not learners. */
const EPSILON = 1e-9;
/**
 * Same-day returns cannot currently feed themselves — stage 1 leaves for 0 or 2
 * in one pass — but the loop is written as a loop with a ceiling so a future
 * interval table cannot turn this into a hang.
 */
const MAX_SAME_DAY_ROUNDS = 12;

export interface ReviewLoadInput {
  goal: Pick<StudyGoalConfig, 'mode' | 'minutesPerDay' | 'wordsPerDay' | 'newWordsPerDay' | 'pacing'>;
  days: number;
  /** How many words the learner's lists hold in total. */
  wordPoolSize: number;
  /** p(known). `really_known` is deliberately not modelled — see the file docs. */
  successRate: number;
  /**
   * Repeats already owed on day one. Seeded at the one-day stage, which is a
   * coarse stand-in for a real snapshot's spread — enough to ask "what does my
   * current backlog do to the next month", not enough to be a restore.
   */
  initialDueReviews?: number;
  /** Whether the learner opens the app on this day at all. Defaults to every day. */
  studyDayPattern?: (dayIndex: number) => boolean;
}

export interface ReviewLoadDay {
  day: number;
  studied: boolean;
  /** Due at the start of the day, before any of it is worked off. */
  dueReviews: number;
  reviewsDone: number;
  newIntroduced: number;
  /** Unique slots planned, the way a session is sized. */
  plannedSlots: number;
  /** Still owed at the end of the day. */
  backlog: number;
  /** Includes five-minute returns, unlike `plannedSlots`. */
  answerEvents: number;
  estimatedMinutes: number;
  /** Monotonic: a word re-learnt after being forgotten is not introduced twice. */
  introducedEver: number;
  unseenRemaining: number;
  /** Introduced words sitting at stage 0 — due every day until they come round. */
  forgottenDue: number;
  matureWords: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * A deterministic fractional cohort flow — no sampling, so the same inputs
 * always give the same curve and a test can assert exact conservation.
 *
 * The three word supplies are kept apart on purpose. `unseenRemaining` is the
 * only one that can feed the new-word target, `forgottenDue` is introduced mass
 * that fell back to stage 0 (which `useWordStream` puts in the *review* queue,
 * ahead of everything else), and `introducedEver` only ever grows by drawing
 * from `unseenRemaining`. Collapsing them lets a word that is forgotten and
 * re-learnt count as introduced twice, which is how a forecast ends up claiming
 * 1200 words learnt out of a list of 1000.
 */
export function simulateReviewLoad(input: ReviewLoadInput): ReviewLoadDay[] {
  const days = Math.max(0, Math.round(input.days));
  const targets = resolveGoalTargets(input.goal);
  const secondsPerItem = estimateSecondsPerItem(input.goal.pacing);
  const isWords = input.goal.mode === 'words';
  const p = clamp(input.successRate, 0, 1);
  const studyToday = input.studyDayPattern ?? (() => true);
  const desiredNew = isWords
    ? targets.desiredNew
    : clamp(Math.round(targets.itemBudget * NEW_SHARE), NEW_MIN, NEW_MAX);

  // Due right now, by stage. Index 0 is the forgotten pool, which never leaves
  // this array on its own: a stage-0 word is due every day until answered.
  const backlog = new Float64Array(MAX_STAGE + 1);
  // Mass that becomes due on a later day, `[day][stage]`. Sized for the horizon
  // plus the longest interval so a sixty-day scheduling near the end still lands.
  const horizon = days + Math.ceil(STAGE_INTERVAL_DAYS[MAX_STAGE]) + 1;
  const scheduled = new Float64Array(horizon * (MAX_STAGE + 1));

  let unseenRemaining = Math.max(0, input.wordPoolSize);
  let introducedEver = Math.max(0, input.initialDueReviews ?? 0);
  let matureWords = 0;
  if (introducedEver > 0) backlog[2] = introducedEver;
  const result: ReviewLoadDay[] = [];

  for (let day = 0; day < days; day += 1) {
    let answerEvents = 0;
    /** Mass that has just landed on the five-minute stage, owed a second look today. */
    let sameDay = 0;

    /** Moves answered mass to where its new stage says it belongs. */
    const place = (mass: number, stage: number) => {
      if (mass <= EPSILON) return;
      if (stage >= MATURE_STAGE) matureWords += mass;
      if (stage === 0) {
        backlog[0] += mass;
        return;
      }
      if (stage === SAME_DAY_STAGE) {
        sameDay += mass;
        return;
      }
      const dueDay = day + Math.round(STAGE_INTERVAL_DAYS[stage]);
      if (dueDay < horizon) scheduled[dueDay * (MAX_STAGE + 1) + stage] += mass;
    };

    /** One answer for `mass` words sitting at `stage`, split by the success rate. */
    const answer = (mass: number, stage: number) => {
      if (mass <= EPSILON) return;
      answerEvents += mass;
      place(mass * p, Math.min(stage + 1, MAX_STAGE));
      place(mass * (1 - p), Math.max(stage - 1, 0));
    };

    for (let stage = 2; stage <= MAX_STAGE; stage += 1) {
      const released = scheduled[day * (MAX_STAGE + 1) + stage];
      if (released > 0) backlog[stage] += released;
    }

    let dueReviews = 0;
    for (let stage = 0; stage <= MAX_STAGE; stage += 1) dueReviews += backlog[stage];

    const studied = studyToday(day);
    if (!studied) {
      // Nothing is answered and nothing expires: the whole day rolls forward.
      result.push({
        day: day + 1, studied: false, dueReviews, reviewsDone: 0, newIntroduced: 0,
        plannedSlots: 0, backlog: dueReviews, answerEvents: 0, estimatedMinutes: 0,
        introducedEver, unseenRemaining, forgottenDue: backlog[0], matureWords,
      });
      continue;
    }

    // The brake decides how much of the budget new words may claim. Only the
    // brake moves capacity to review — a shortage of unlearnt words must not
    // silently become extra repeats, which is what `plan.ts` also refuses to do.
    const afterBacklog = adjustNewTargetForBacklog(desiredNew, dueReviews, targets.itemBudget);
    let newIntroduced = Math.min(afterBacklog, unseenRemaining);
    const reviewsDone = Math.min(Math.max(0, targets.itemBudget - afterBacklog), dueReviews);
    // Minutes mode hands unused review capacity back to new words; words mode
    // holds its two targets fixed. Mirrors `spare` in `planSession`.
    if (!isWords) {
      const spare = targets.itemBudget - newIntroduced - reviewsDone;
      if (spare > 0) newIntroduced = Math.min(newIntroduced + spare, NEW_MAX, unseenRemaining);
    }

    // Repeats are served forgotten-first, then by ascending stage — the order
    // `planSession` sorts its review pool into.
    let remaining = reviewsDone;
    for (let stage = 0; stage <= MAX_STAGE && remaining > EPSILON; stage += 1) {
      const taken = Math.min(backlog[stage], remaining);
      if (taken <= EPSILON) continue;
      backlog[stage] -= taken;
      remaining -= taken;
      if (stage >= MATURE_STAGE) matureWords -= taken;
      answer(taken, stage);
    }

    if (newIntroduced > EPSILON) {
      unseenRemaining -= newIntroduced;
      introducedEver += newIntroduced;
      answer(newIntroduced, 0);
    }

    // The five-minute return is a real transition, not just another tick on the
    // clock: without answering it the cohort would sit on stage 1 forever and
    // every later day's load would be wrong.
    for (let round = 0; round < MAX_SAME_DAY_ROUNDS && sameDay > EPSILON; round += 1) {
      const returning = sameDay;
      sameDay = 0;
      answer(returning, SAME_DAY_STAGE);
    }

    let endBacklog = 0;
    for (let stage = 0; stage <= MAX_STAGE; stage += 1) endBacklog += backlog[stage];

    result.push({
      day: day + 1,
      studied: true,
      dueReviews,
      reviewsDone,
      newIntroduced,
      plannedSlots: newIntroduced + reviewsDone,
      backlog: endBacklog,
      answerEvents,
      estimatedMinutes: (answerEvents * secondsPerItem) / 60,
      introducedEver,
      unseenRemaining,
      forgottenDue: backlog[0],
      matureWords,
    });
  }

  return result;
}
