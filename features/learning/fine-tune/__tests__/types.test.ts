import { describe, expect, it } from 'vitest';
import { parseTypingVariant, TYPING_VARIANTS, typingScaffold } from '../types';

describe('typing scaffold', () => {
  const letters = (count: number) => Array.from({ length: count }, () => 'a');

  it('never pre-fills the entire answer or creates a negative reveal budget', () => {
    for (const editableCount of [0, 1, 2, 3, 5, 6, 7, 9, 13]) {
      for (const variant of TYPING_VARIANTS) {
        const scaffold = typingScaffold({
          ...parseTypingVariant(variant),
          editableSlots: letters(editableCount),
        });
        expect(scaffold.prefillCount).toBeGreaterThanOrEqual(0);
        expect(scaffold.prefillCount).toBeLessThanOrEqual(Math.max(0, editableCount - 1));
        expect(scaffold.hintCap).toBeGreaterThanOrEqual(scaffold.prefillCount);
        expect(scaffold.hintBudget).toBe(scaffold.hintCap - scaffold.prefillCount);
      }
    }
  });

  it('uses ceil for hint caps and keeps the two no-hint rungs disabled', () => {
    expect(typingScaffold({ ...parseTypingVariant('90:90'), editableSlots: letters(7) }))
      .toEqual({ prefillCount: 6, hintCap: 6, hintBudget: 0 });
    expect(typingScaffold({ ...parseTypingVariant('50:90'), editableSlots: letters(7) }))
      .toEqual({ prefillCount: 3, hintCap: 6, hintBudget: 3 });
    expect(typingScaffold({ ...parseTypingVariant('0:20'), editableSlots: letters(6) }))
      .toEqual({ prefillCount: 0, hintCap: 2, hintBudget: 2 });
    expect(typingScaffold({ ...parseTypingVariant('0:10'), editableSlots: letters(6) }))
      .toEqual({ prefillCount: 0, hintCap: 1, hintBudget: 1 });
    expect(typingScaffold({ ...parseTypingVariant('0:0'), editableSlots: letters(7) }))
      .toEqual({ prefillCount: 0, hintCap: 0, hintBudget: 0 });
  });

  it('never leaves punctuation as the only thing to type', () => {
    // "word?" — the heaviest scaffold would otherwise reveal w-o-r-d and ask
    // for the question mark.
    for (const variant of TYPING_VARIANTS) {
      const slots = [...'word?'];
      const { prefillCount, hintCap } = typingScaffold({
        ...parseTypingVariant(variant),
        editableSlots: slots,
      });
      const blanks = slots.slice(prefillCount);
      const blanksAfterHints = slots.slice(hintCap);
      expect(blanks.some((slot) => !/[\s\p{P}]/u.test(slot))).toBe(true);
      expect(blanksAfterHints.some((slot) => !/[\s\p{P}]/u.test(slot))).toBe(true);
    }
  });

  it('leaves punctuation inside a longer blank alone', () => {
    // Three trailing dots plus the last letter still to type is a real task.
    expect(typingScaffold({ ...parseTypingVariant('90:90'), editableSlots: [...'ahoj...'] }))
      .toMatchObject({ prefillCount: 3 });
    // Punctuation in the middle never blocks a reveal that stops before a later letter.
    expect(typingScaffold({ ...parseTypingVariant('50:90'), editableSlots: [...'co?ne'] }))
      .toMatchObject({ prefillCount: 2 });
  });

  it('falls back to leaving one slot when the answer has no letters at all', () => {
    expect(typingScaffold({ ...parseTypingVariant('90:90'), editableSlots: [...'!!!'] }))
      .toMatchObject({ prefillCount: 2 });
  });
});
