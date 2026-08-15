import { describe, expect, it } from 'vitest';
import {
  chooseBaseStudyListForPair,
  isStudyGated,
  resolveActiveStudyWords,
} from '../study-list-selection';

const lists = [
  {
    id: 'personal-vi',
    languageFrom: 'cs',
    languageTo: 'vi',
    isOwnedPersonal: true,
  },
  {
    id: 'common-vi',
    languageFrom: 'cs',
    languageTo: 'vi',
    isRecommended: true,
  },
  {
    id: 'personal-en',
    languageFrom: 'cs',
    languageTo: 'en',
    isOwnedPersonal: true,
  },
  {
    id: 'common-en',
    languageFrom: 'cs',
    languageTo: 'en',
    isRecommended: true,
  },
];

describe('chooseBaseStudyListForPair', () => {
  it('keeps the non-personal list as the base when personal words overlay it', () => {
    expect(chooseBaseStudyListForPair(lists, 'common-en', 'cs', 'vi')).toBe('common-vi');
  });

  it('uses the personal list when no non-personal list exists for the pair', () => {
    expect(chooseBaseStudyListForPair(lists, 'common-vi', 'cs', 'de')).toBeNull();
    expect(
      chooseBaseStudyListForPair(
        [lists[0]],
        'common-vi',
        'cs',
        'vi',
      ),
    ).toBe('personal-vi');
  });

  it('normalizes Czech language aliases while switching pairs', () => {
    expect(chooseBaseStudyListForPair(lists, 'common-en', 'cz', 'vi')).toBe('common-vi');
  });
});

describe('resolveActiveStudyWords', () => {
  it('keeps the study surface empty when the selected pair has no list', () => {
    expect(
      resolveActiveStudyWords(null, false, ['word-from-another-pair'], []),
    ).toEqual([]);
  });

  it('shows the default catalogue only after the pair has personal words', () => {
    expect(
      resolveActiveStudyWords(lists[1], true, ['scoped-word'], ['fallback-word']),
    ).toEqual(['scoped-word']);
    expect(
      resolveActiveStudyWords(lists[1], false, ['catalogue-word'], []),
    ).toEqual([]);
  });

  it('never holds back a list the learner chose', () => {
    // A teacher's list through `/join`, a school assignment, or any public list
    // the learner subscribed to: not recommended, so not gated. Emptying these
    // would hide content someone deliberately opted into.
    const sharedList = { id: 'teacher-vi', languageFrom: 'cs', languageTo: 'vi' };
    expect(
      resolveActiveStudyWords(sharedList, false, ['shared-word'], []),
    ).toEqual(['shared-word']);
  });
});

describe('isStudyGated', () => {
  it('gates only the default catalogue without personal words', () => {
    expect(isStudyGated(lists[1], false)).toBe(true);
    expect(isStudyGated(lists[1], true)).toBe(false);
    expect(isStudyGated(lists[0], false)).toBe(false);
    expect(isStudyGated({ id: 'x', languageFrom: 'cs', languageTo: 'vi' }, false)).toBe(false);
    expect(isStudyGated(null, false)).toBe(false);
  });
});
