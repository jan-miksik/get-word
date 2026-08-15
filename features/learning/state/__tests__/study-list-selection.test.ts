import { describe, expect, it } from 'vitest';
import {
  chooseBaseStudyListForPair,
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

  it('shows the scoped list only after the pair has personal words', () => {
    expect(
      resolveActiveStudyWords(lists[1], true, ['scoped-word'], ['fallback-word']),
    ).toEqual(['scoped-word']);
    expect(
      resolveActiveStudyWords(lists[1], false, ['catalogue-word'], []),
    ).toEqual([]);
  });
});
