import { describe, expect, it } from 'vitest';
import { parseTypingVariant, TYPING_VARIANTS, typingScaffold } from '../types';

describe('typing scaffold', () => {
  it('never pre-fills the entire answer or creates a negative reveal budget', () => {
    for (const editableCount of [0, 1, 2, 3, 5, 6, 7, 9, 13]) {
      for (const variant of TYPING_VARIANTS) {
        const scaffold = typingScaffold({
          ...parseTypingVariant(variant),
          editableCount,
        });
        expect(scaffold.prefillCount).toBeGreaterThanOrEqual(0);
        expect(scaffold.prefillCount).toBeLessThanOrEqual(Math.max(0, editableCount - 1));
        expect(scaffold.hintCap).toBeGreaterThanOrEqual(scaffold.prefillCount);
        expect(scaffold.hintBudget).toBe(scaffold.hintCap - scaffold.prefillCount);
      }
    }
  });

  it('uses ceil for hint caps and keeps the two no-hint rungs disabled', () => {
    expect(typingScaffold({ ...parseTypingVariant('90:90'), editableCount: 7 }))
      .toEqual({ prefillCount: 6, hintCap: 6, hintBudget: 0 });
    expect(typingScaffold({ ...parseTypingVariant('50:90'), editableCount: 7 }))
      .toEqual({ prefillCount: 3, hintCap: 6, hintBudget: 3 });
    expect(typingScaffold({ ...parseTypingVariant('0:20'), editableCount: 6 }))
      .toEqual({ prefillCount: 0, hintCap: 2, hintBudget: 2 });
    expect(typingScaffold({ ...parseTypingVariant('0:10'), editableCount: 6 }))
      .toEqual({ prefillCount: 0, hintCap: 1, hintBudget: 1 });
    expect(typingScaffold({ ...parseTypingVariant('0:0'), editableCount: 7 }))
      .toEqual({ prefillCount: 0, hintCap: 0, hintBudget: 0 });
  });
});
