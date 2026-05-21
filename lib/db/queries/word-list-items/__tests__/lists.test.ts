import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../client', () => ({ db: {} }));

import {
  getListLanguageCodeVariants,
  pickRecommendedWordList,
} from '../lists';

const baseList = {
  id: 'list-1',
  ownerId: null,
  name: 'List',
  description: null,
  languageFrom: 'cs',
  languageTo: 'vi',
  isPublic: true,
  isCommon: false,
  isRecommended: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('word list language matching', () => {
  it('treats Czech legacy and current codes as the same list language', () => {
    expect(getListLanguageCodeVariants('cs')).toEqual(['cs', 'cz']);
    expect(getListLanguageCodeVariants('cz')).toEqual(['cs', 'cz']);
    expect(getListLanguageCodeVariants('vi')).toEqual(['vi']);
  });

  it('picks an exact selected list before reverse or fallback lists', () => {
    const result = pickRecommendedWordList([
      { ...baseList, id: 'reverse', languageFrom: 'vi', languageTo: 'cs', isRecommended: true },
      { ...baseList, id: 'exact', languageFrom: 'cz', languageTo: 'vi', isRecommended: true },
    ], 'cs', 'vi', { ...baseList, id: 'seed', isCommon: true });

    expect(result).toMatchObject({ reason: 'exact', list: { id: 'exact' } });
  });

  it('picks a reverse selected list when no exact selected list exists', () => {
    const result = pickRecommendedWordList([
      { ...baseList, id: 'reverse', languageFrom: 'cz', languageTo: 'vi', isRecommended: true },
    ], 'vi', 'cs', { ...baseList, id: 'seed', isCommon: true });

    expect(result).toMatchObject({ reason: 'reverse', list: { id: 'reverse' } });
  });

  it('falls back to the seed list when no selected list matches either direction', () => {
    const result = pickRecommendedWordList([
      { ...baseList, id: 'unselected', languageFrom: 'cs', languageTo: 'vi', isRecommended: false },
    ], 'cs', 'vi', { ...baseList, id: 'seed', isCommon: true });

    expect(result).toMatchObject({ reason: 'fallback_seed', list: { id: 'seed' } });
  });
});
