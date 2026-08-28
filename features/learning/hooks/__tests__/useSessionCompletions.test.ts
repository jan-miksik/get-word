import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ProgressData } from '@/features/sync/contracts';
import type { NormalizedWord } from '@/lib/words';

import { useSessionCompletions } from '../useSessionCompletions';

const WORD = { id: 'w1', cz: 'pes', vi: 'con chó', en: '', category: ['word'] } as NormalizedWord;

const progressWith = (answers: number): Record<string, ProgressData> => ({
  w1: { stageIndex: 3, knownCount: answers, unknownCount: 0 },
});

describe('useSessionCompletions', () => {
  it('records the answer where the word stood when it was given', () => {
    const { result } = renderHook(() => useSessionCompletions());
    act(() => result.current.recordAnswerGiven(WORD, progressWith(2)));
    expect(result.current.pendingAnswers).toEqual({ w1: 2 });
    // Marking the answer is not a card leaving the deck.
    expect(result.current.completedDeckWordCards).toBe(0);
  });

  it('does not count the same appearance twice when the card then leaves the deck', () => {
    const { result } = renderHook(() => useSessionCompletions());
    // The verdict is marked, and the card is still on screen showing it.
    act(() => result.current.recordAnswerGiven(WORD, progressWith(2)));
    // The continue tap: the SRS write is still queued behind the exit animation,
    // so the word is at the same answer count as when it was marked.
    act(() => result.current.recordDeckCardCompleted(WORD, progressWith(2)));
    expect(result.current.pendingAnswers).toEqual({ w1: 2 });
    expect(result.current.completedDeckWordCards).toBe(1);
  });

  it('records a genuine second answer, which arrives at a higher count', () => {
    const { result } = renderHook(() => useSessionCompletions());
    act(() => result.current.recordAnswerGiven(WORD, progressWith(2)));
    // The write landed, and the closing block asks for the same word again.
    act(() => result.current.recordAnswerGiven(WORD, progressWith(3)));
    expect(result.current.pendingAnswers).toEqual({ w1: 3 });
  });

  it('records a reveal card, which reports only when it leaves the deck', () => {
    const { result } = renderHook(() => useSessionCompletions());
    act(() => result.current.recordDeckCardCompleted(WORD, progressWith(0)));
    expect(result.current.pendingAnswers).toEqual({ w1: 0 });
    expect(result.current.completedDeckWordCards).toBe(1);
  });

  it('counts a finished minigame round once', () => {
    const { result } = renderHook(() => useSessionCompletions());
    act(() => result.current.recordGameFinished({ id: 'g1' }));
    act(() => result.current.recordGameFinished({ id: 'g1' }));
    expect([...result.current.completedGameIds]).toEqual(['g1']);
  });
});
