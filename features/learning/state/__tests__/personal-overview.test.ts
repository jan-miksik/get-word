import { describe, expect, it } from 'vitest';
import type { NormalizedWord } from '@/lib/words';
import { includePersonalWordsForActivePair } from '../personal-overview';

function word(id: string, listId: string): NormalizedWord {
  return {
    id,
    listId,
    category: ['word'],
    cz: id,
    en: '',
    vi: id,
  };
}

describe('includePersonalWordsForActivePair', () => {
  const lists = [
    { id: 'catalog-cs-vi', languageFrom: 'cs', languageTo: 'vi' },
    {
      id: 'personal-cs-vi',
      languageFrom: 'cz',
      languageTo: 'vi',
      isOwnedPersonal: true,
    },
    {
      id: 'personal-cs-uk',
      languageFrom: 'cs',
      languageTo: 'uk',
      isOwnedPersonal: true,
    },
  ];

  it('restores personal words for the active pair after category filtering', () => {
    const catalogWord = word('catalog', 'catalog-cs-vi');
    const personalWord = word('personal', 'personal-cs-vi');
    const otherPairWord = word('other-pair', 'personal-cs-uk');

    expect(
      includePersonalWordsForActivePair(
        [catalogWord],
        [catalogWord, personalWord, otherPairWord],
        lists,
        'catalog-cs-vi',
      ).map((item) => item.id),
    ).toEqual(['catalog', 'personal']);
  });

  it('does not duplicate a personal word already present', () => {
    const personalWord = word('personal', 'personal-cs-vi');

    expect(
      includePersonalWordsForActivePair(
        [personalWord],
        [personalWord],
        lists,
        'personal-cs-vi',
      ),
    ).toEqual([personalWord]);
  });
});
