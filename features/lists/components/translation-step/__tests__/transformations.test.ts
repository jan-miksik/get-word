import { describe, expect, it } from 'vitest';
import {
  createCategoryByRow,
  createTranslationRows,
  findDuplicateGroups,
  mergeAcceptedAnswers,
} from '../transformations';
import type { PendingTranslationItem, TranslationRow } from '../types';

const pendingItems: PendingTranslationItem[] = [
  {
    id: 'new',
    text_known: 'pes',
    text_target: null,
    accepted_known: ['pejsek'],
    position: 0,
    category_id: 'animals',
  },
  {
    id: 'ready',
    text_known: 'kočka',
    text_target: 'cat',
    position: 1,
    category_id: null,
  },
];

describe('translation-step transformations', () => {
  it('creates row and category state without changing pending/ready semantics', () => {
    expect(createTranslationRows(pendingItems)).toMatchObject([
      { id: 'new', textKnown: 'pes', textTarget: '', status: 'pending', acceptedKnown: ['pejsek'] },
      { id: 'ready', textKnown: 'kočka', textTarget: 'cat', status: 'ok' },
    ]);
    expect(createCategoryByRow(pendingItems)).toEqual({ new: 'animals', ready: null });
  });

  it('merges normalized unique accepted answers and excludes the primary answer', () => {
    expect(mergeAcceptedAnswers(['hound'], [' HOUND ', 'dog', 'pes'], 'pes')).toEqual([
      'hound',
      'dog',
    ]);
  });

  it('marks only whole-pair case-insensitive duplicates', () => {
    const rows: TranslationRow[] = [
      { id: 'a', textKnown: 'Pes', textTarget: 'Dog', status: 'ok' },
      { id: 'b', textKnown: 'pes', textTarget: 'dog', status: 'ok' },
      { id: 'c', textKnown: 'pes', textTarget: 'hound', status: 'ok' },
    ];
    expect(findDuplicateGroups(rows, 'textKnown', 'textTarget')).toHaveLength(1);
    expect(findDuplicateGroups(rows, 'textKnown', 'textTarget')[0].rows.map((row) => row.id)).toEqual([
      'a',
      'b',
    ]);
  });
});
