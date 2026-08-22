import { describe, expect, it } from 'vitest';

import { LEARNER_ARCHETYPES, summarizeAllArchetypes, summarizeArchetype } from '../cohorts';
import type { StudyPacing } from '../goal';

const pacing: StudyPacing = {
  revealMode: 'press', minigameFrequency: 'off', fineTune: { version: 3, stages: [] },
};
const goal = { mode: 'words' as const, minutesPerDay: 10, wordsPerDay: 10, newWordsPerDay: 10, pacing };

describe('learner archetypes', () => {
  it('accounts for a whole hundred learners', () => {
    expect(LEARNER_ARCHETYPES.reduce((sum, one) => sum + one.share, 0)).toBe(100);
    expect(new Set(LEARNER_ARCHETYPES.map((one) => one.id)).size).toBe(LEARNER_ARCHETYPES.length);
  });

  it('studies its stated number of days in an ordinary week', () => {
    for (const archetype of LEARNER_ARCHETYPES) {
      // Week 0 is never a skipped week for any of the patterns, and no absence
      // block starts that early, so it shows the underlying weekly shape.
      const studied = Array.from({ length: 7 }, (_, day) => archetype.studyDayPattern(day))
        .filter(Boolean).length;
      expect(studied).toBe(archetype.daysPerWeek);
    }
  });

  it('lets the drifter stop and the returner come back', () => {
    const drifter = LEARNER_ARCHETYPES.find((one) => one.id === 'drifter')!;
    expect(drifter.studyDayPattern(20)).toBe(false);
    expect(Array.from({ length: 100 }, (_, day) => day).filter((day) => drifter.studyDayPattern(day)))
      .toHaveLength(4);

    const returner = LEARNER_ARCHETYPES.find((one) => one.id === 'returner')!;
    const absent = Array.from({ length: 30 }, (_, offset) => returner.studyDayPattern(45 + offset));
    expect(absent.some(Boolean)).toBe(false);
    expect(Array.from({ length: 14 }, (_, offset) => returner.studyDayPattern(75 + offset)).some(Boolean))
      .toBe(true);
  });

  it('reads off three horizons, ordered and finite', () => {
    const summary = summarizeArchetype(LEARNER_ARCHETYPES[2], goal, { wordPoolSize: 2000 });
    expect(summary.slices.map((slice) => slice.day)).toEqual([30, 90, 365]);
    for (const slice of summary.slices) {
      expect(Number.isFinite(slice.reviewsPerStudyDay)).toBe(true);
      expect(Number.isFinite(slice.minutesPerStudyDay)).toBe(true);
      expect(slice.peakBacklog).toBeGreaterThanOrEqual(slice.backlog - 1e-6);
    }
    const [month, quarter, year] = summary.slices;
    expect(month.introducedEver).toBeLessThanOrEqual(quarter.introducedEver);
    expect(quarter.introducedEver).toBeLessThanOrEqual(year.introducedEver);
  });

  it('ranks a year of learning the way the habits rank', () => {
    const byId = new Map(summarizeAllArchetypes(goal, { wordPoolSize: 4000 })
      .map((summary) => [summary.archetype.id, summary.slices.at(-1)!]));
    expect(byId.get('daily')!.introducedEver).toBeGreaterThan(byId.get('steady')!.introducedEver);
    expect(byId.get('steady')!.introducedEver).toBeGreaterThan(byId.get('wobbler')!.introducedEver);
    expect(byId.get('wobbler')!.introducedEver).toBeGreaterThan(byId.get('drifter')!.introducedEver);
    // Three weeks of two-day study, then nothing — no year-long curve at all.
    expect(byId.get('drifter')!.studyDays).toBe(4);
    expect(byId.get('drifter')!.reviewsPerStudyDay).toBe(0);
  });

  it('shows the returner paying for the month away', () => {
    const returner = summarizeArchetype(
      LEARNER_ARCHETYPES.find((one) => one.id === 'returner')!, goal, { wordPoolSize: 2000 },
    );
    const beforeLeaving = returner.days[44].backlog;
    const onReturn = returner.days[74].backlog;
    expect(onReturn).toBeGreaterThan(beforeLeaving);
  });
});
