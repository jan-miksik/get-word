import { describe, it, expect } from 'vitest';
import {
  inventLookalikeForms,
  scriptAlphabet,
  surfaceKey,
} from '../invented-forms';
import { similarityBandForTerms } from '../similarity';

const czech = scriptAlphabet(['fér', 'můj', 'věc', 'hůl', 'čaj', 'zítra', 'dům']);
const vietnamese = scriptAlphabet(['phở', 'mẹ', 'cảm ơn', 'người', 'nước', 'bàn']);

const invent = (term: string, alphabet: ReadonlySet<string>, limit = 4) =>
  inventLookalikeForms({
    term,
    alphabet,
    isTaken: () => false,
    limit,
    random: () => 0,
  });

describe('inventLookalikeForms', () => {
  it('keeps every invented spelling within the hardest similarity band', () => {
    const forms = invent('fér', czech);
    expect(forms.length).toBeGreaterThan(0);
    for (const form of forms) {
      expect(similarityBandForTerms(form, 'fér')).toBe('III');
      expect(surfaceKey(form)).not.toBe(surfaceKey('fér'));
    }
  });

  it('stays inside the alphabet the list actually uses', () => {
    // A Czech list must never be offered a Vietnamese tone mark, however
    // confusable the letter families say it is.
    for (const form of invent('kolo', czech, 20)) {
      expect(form).toMatch(/^[a-záéěíóúůýčďňřšťž]+$/i);
    }
    expect(invent('phở', vietnamese, 20).join(' ')).toMatch(/[ơớờởỡợo]/);
  });

  it('drops an accent even when the plain letter is absent from the list', () => {
    // The bare base letter is always available: forgetting the accent is the
    // mistake being tested, and every Latin alphabet contains the plain form.
    expect(invent('fér', scriptAlphabet(['fér']), 20)).toContain('fer');
  });

  it('never offers a spelling that is already taken', () => {
    const forms = inventLookalikeForms({
      term: 'fér',
      alphabet: czech,
      isTaken: (candidate) => surfaceKey(candidate) === 'fer',
      limit: 20,
      random: () => 0,
    });
    expect(forms).not.toContain('fer');
  });

  it('keeps the original capitalisation', () => {
    for (const form of invent('Fér', czech, 20)) {
      expect(form[0]).toBe(form[0].toLocaleUpperCase());
    }
  });

  it('leaves phrases alone but still bends two-letter words', () => {
    // Phrases are told apart by their shape long before their accents. Short
    // Vietnamese syllables are the opposite case: the accent is the whole test.
    expect(invent('cảm ơn', vietnamese)).toEqual([]);
    expect(invent('cá', vietnamese, 20)).toContain('cà');
    expect(invent('a', vietnamese)).toEqual([]);
  });

  it('uses same-list letters when no word carries an accent', () => {
    const forms = invent('pes', scriptAlphabet(['pes', 'kolo', 'stul']), 20);
    expect(forms.length).toBeGreaterThan(0);
    expect(forms.every((form) => similarityBandForTerms(form, 'pes') === 'III')).toBe(true);
  });

  it('respects the limit and repeats for the same seed', () => {
    const seeded = () => {
      let state = 1;
      return () => {
        state = (state * 16807) % 2147483647;
        return state / 2147483647;
      };
    };
    const draw = (limit: number) =>
      inventLookalikeForms({
        term: 'người',
        alphabet: vietnamese,
        isTaken: () => false,
        limit,
        random: seeded(),
      });

    expect(draw(20).length).toBeGreaterThan(2);
    expect(draw(2)).toHaveLength(2);
    expect(draw(2)).toEqual(draw(2));
  });

  it('supplements a sparse accent family with same-list letter edits', () => {
    const forms = invent('můj', scriptAlphabet(['můj', 'pes', 'kolo']), 20);
    expect(forms).toContain('muj');
    expect(forms.length).toBeGreaterThan(1);
    expect(forms.every((form) => similarityBandForTerms(form, 'můj') === 'III')).toBe(true);
  });

});
