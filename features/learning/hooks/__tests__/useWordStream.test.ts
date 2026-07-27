import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useWordStream } from '../useWordStream';
import type { ProgressData } from '@/features/sync/types';
import type { NormalizedWord } from '@/lib/words';

function makeWord(id: string, categoryId: string | null): NormalizedWord {
  return {
    id,
    listId: 'list-1',
    categoryId,
    category: ['basics', 'word'],
    listPosition: Number(id.split('-')[1] ?? 0),
    cz: `cz ${id}`,
    en: `en ${id}`,
    vi: `vi ${id}`,
  } as NormalizedWord;
}

const HOUR = 60 * 60 * 1000;

function progressFor(
  entries: Record<string, { stageIndex: number; nextDueAt?: number }>,
): Record<string, ProgressData> {
  return entries as unknown as Record<string, ProgressData>;
}

describe('useWordStream priority bucketing', () => {
  const own = makeWord('own-0', 'cat-own');
  const ownSecond = makeWord('own-1', 'cat-own');
  const other = makeWord('other-2', 'cat-other');

  it('leaves everything in the normal buckets when nothing is pinned', () => {
    const { result } = renderHook(() =>
      useWordStream([own, other], progressFor({}), true),
    );

    expect(result.current.priorityWords).toEqual([]);
    expect(result.current.newWords.map((word) => word.id)).toEqual(['own-0', 'other-2']);
  });

  it('pulls pinned-category words ahead of due repeats', () => {
    // `other-2` is overdue; textbook spaced repetition would serve it first.
    // The product bet is that words the learner just asked for come first.
    const progress = progressFor({
      'other-2': { stageIndex: 2, nextDueAt: Date.now() - HOUR },
    });

    const { result } = renderHook(() =>
      useWordStream([own, other], progress, true, [], 0, ['cat-own']),
    );

    expect(result.current.priorityWords.map((word) => word.id)).toEqual(['own-0']);
    expect(result.current.dueWords.map((word) => word.id)).toEqual(['other-2']);
    expect(result.current.newWords).toEqual([]);
  });

  it('serves a due pinned word before an unseen pinned word', () => {
    const progress = progressFor({
      'own-0': { stageIndex: 2, nextDueAt: Date.now() - HOUR },
    });

    const { result } = renderHook(() =>
      useWordStream([own, ownSecond], progress, true, [], 0, ['cat-own']),
    );

    // The pin decides order against OTHER words, not against the learner's own
    // memory: something already due still comes before something never seen.
    expect(result.current.priorityWords.map((word) => word.id)).toEqual(['own-0', 'own-1']);
    // ...and only the one with history counts as a repeat. A word the learner
    // has never opened must not show up in the "review due" badge.
    expect(result.current.priorityDueCount).toBe(1);
  });

  it('leaves settling pinned words on their normal schedule', () => {
    const progress = progressFor({
      'own-0': { stageIndex: 3, nextDueAt: Date.now() + 48 * HOUR },
    });

    const { result } = renderHook(() =>
      useWordStream([own], progress, true, [], 0, ['cat-own']),
    );

    expect(result.current.priorityWords).toEqual([]);
    expect(result.current.settlingWords.map((word) => word.id)).toEqual(['own-0']);
  });

  it('ignores a pin for a category no word belongs to', () => {
    const { result } = renderHook(() =>
      useWordStream([other], progressFor({}), true, [], 0, ['cat-deleted']),
    );

    expect(result.current.priorityWords).toEqual([]);
    expect(result.current.newWords.map((word) => word.id)).toEqual(['other-2']);
  });

  it('returns empty buckets before hydration', () => {
    const { result } = renderHook(() =>
      useWordStream([own, other], progressFor({}), false, [], 0, ['cat-own']),
    );

    expect(result.current).toEqual({
      priorityWords: [],
      priorityDueCount: 0,
      dueWords: [],
      newWords: [],
      settlingWords: [],
    });
  });
});
