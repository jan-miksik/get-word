import { describe, expect, it } from 'vitest';
import {
  areOrthographicVariants,
  baseLetterEditDistance,
  foldToBaseLetter,
  getAnswerVerdict,
} from '@/lib/answer-normalization';

describe('foldToBaseLetter', () => {
  it('strips marks, stroke and case down to the bare letter', () => {
    expect(['á', 'ă', 'ạ', 'â', 'Ǎ'].map(foldToBaseLetter)).toEqual(['a', 'a', 'a', 'a', 'a']);
    expect(foldToBaseLetter('đ')).toBe('d');
    expect(foldToBaseLetter('Đ')).toBe('d');
    expect(foldToBaseLetter('ł')).toBe('l');
    expect(foldToBaseLetter('ø')).toBe('o');
  });

  it('leaves two different letters different', () => {
    expect(foldToBaseLetter('u')).not.toBe(foldToBaseLetter('y'));
    expect(foldToBaseLetter('ư')).toBe('u');
    expect(foldToBaseLetter('ý')).toBe('y');
  });
});

describe('areOrthographicVariants', () => {
  it('is true only for the same letter in different dress', () => {
    expect(areOrthographicVariants('a', 'ạ')).toBe(true);
    expect(areOrthographicVariants('d', 'đ')).toBe(true);
    expect(areOrthographicVariants('u', 'ư')).toBe(true);
    expect(areOrthographicVariants('u', 'y')).toBe(false);
    expect(areOrthographicVariants('u', 'ý')).toBe(false);
    expect(areOrthographicVariants('n', 'm')).toBe(false);
    expect(areOrthographicVariants('.', ',')).toBe(false);
  });
});

describe('baseLetterEditDistance', () => {
  it('is zero when only the marks differ', () => {
    expect(baseLetterEditDistance('con meo', 'con mèo')).toBe(0);
    expect(baseLetterEditDistance('dong', 'đồng')).toBe(0);
    expect(baseLetterEditDistance('an', 'ăn')).toBe(0);
    expect(baseLetterEditDistance('LODZ', 'łódź')).toBe(0);
  });

  it('counts a swapped letter, a missing one and an extra one', () => {
    // u ↔ y is two different letters, not one letter written two ways.
    expect(baseLetterEditDistance('byt', 'but')).toBe(1);
    expect(baseLetterEditDistance('cào', 'chào')).toBe(1);
    expect(baseLetterEditDistance('chàoo', 'chào')).toBe(1);
    expect(baseLetterEditDistance('cat', 'pes')).toBe(3);
  });

  it('agrees with the close verdict on which mistakes are decorative', () => {
    expect(getAnswerVerdict('byt', 'but')).toBe('wrong');
    expect(baseLetterEditDistance('byt', 'but')).toBeGreaterThan(0);
    expect(getAnswerVerdict('bạn', 'bán')).toBe('close');
    expect(baseLetterEditDistance('bạn', 'bán')).toBe(0);
  });
});
