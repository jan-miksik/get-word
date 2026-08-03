import { describe, expect, it } from 'vitest';
import { buildFollowUpChips } from '../followUpChips';

const empty = { missingTopics: [], situations: [], goals: [], coveredTopics: [] };

describe('buildFollowUpChips', () => {
  it('offers nothing when the brief is empty, so the intro stays chip-free', () => {
    expect(buildFollowUpChips(empty)).toEqual([]);
  });

  it('puts what the learner asked for but never studied first', () => {
    expect(
      buildFollowUpChips(
        {
          ...empty,
          missingTopics: ['Booking appointments'],
          situations: ['Salon small talk'],
          goals: ['Talk to salon clients'],
        },
        3,
      ),
    ).toEqual([
      { topic: 'Booking appointments', kind: 'topic' },
      { topic: 'Salon small talk', kind: 'topic' },
      { topic: 'Talk to salon clients', kind: 'topic' },
    ]);
  });

  it('offers a single chip by default, not a row of topics', () => {
    expect(
      buildFollowUpChips({
        ...empty,
        missingTopics: ['Booking appointments', 'Doctor visits'],
      }),
    ).toEqual([{ topic: 'Booking appointments', kind: 'topic' }]);
  });

  it('drops topics already on the list, ignoring case and diacritics', () => {
    expect(
      buildFollowUpChips({
        ...empty,
        situations: ['Úřední slovníček', 'Doctor visits'],
        coveredTopics: ['urední slovnicek'],
      }),
    ).toEqual([{ topic: 'Doctor visits', kind: 'topic' }]);
  });

  it('treats a longer wording of a covered topic as the same topic', () => {
    expect(
      buildFollowUpChips({
        ...empty,
        situations: ['Salon small talk with new clients'],
        coveredTopics: ['Salon small talk'],
        goals: ['Small talk'],
      }),
      // Nothing new is left, so only the deeper pass over it remains.
    ).toEqual([{ topic: 'Salon small talk', kind: 'continue' }]);
  });

  it('does not let a short covered label swallow unrelated topics', () => {
    expect(
      buildFollowUpChips({ ...empty, situations: ['Work meetings'], coveredTopics: ['work'] }),
    ).toEqual([{ topic: 'Work meetings', kind: 'topic' }]);
  });

  it('deduplicates the same topic arriving from two brief fields', () => {
    expect(
      buildFollowUpChips(
        { ...empty, missingTopics: ['Booking appointments'], situations: ['booking appointments'] },
        3,
      ),
    ).toEqual([{ topic: 'Booking appointments', kind: 'topic' }]);
  });

  it('honours an explicit cap', () => {
    expect(
      buildFollowUpChips(
        { ...empty, missingTopics: ['One', 'Two', 'Three', 'Four', 'Five'] },
        4,
      ),
    ).toHaveLength(4);
  });

  it('falls back to going deeper into the most recent topic', () => {
    expect(
      buildFollowUpChips({ ...empty, coveredTopics: ['Small talk', 'Morálka a etika'] }),
    ).toEqual([{ topic: 'Morálka a etika', kind: 'continue' }]);
  });

  it('ignores generic personal-list labels left by older sessions', () => {
    expect(
      buildFollowUpChips({
        ...empty,
        coveredTopics: ['Objednání v kavárně', 'Moje slovíčka'],
      }),
    ).toEqual([{ topic: 'Objednání v kavárně', kind: 'continue' }]);

    expect(
      buildFollowUpChips({ ...empty, coveredTopics: ['My words — Vietnamese'] }),
    ).toEqual([]);
  });

  it('does not offer the deeper pass once there is somewhere new to go', () => {
    expect(
      buildFollowUpChips({
        ...empty,
        situations: ['Doctor visits'],
        coveredTopics: ['Morálka a etika'],
      }),
    ).toEqual([{ topic: 'Doctor visits', kind: 'topic' }]);
  });
});
