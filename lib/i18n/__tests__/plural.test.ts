import { describe, expect, it } from 'vitest';
import { getPluralCategory, pluralForm } from '../plural';

describe('getPluralCategory', () => {
  it('uses the paucal for Czech 2-4 and the genitive plural from 5 up', () => {
    expect(getPluralCategory('cs', 1)).toBe('one');
    expect(getPluralCategory('cs', 2)).toBe('few');
    expect(getPluralCategory('cs', 4)).toBe('few');
    expect(getPluralCategory('cs', 5)).toBe('many');
    expect(getPluralCategory('cs', 22)).toBe('many');
    expect(getPluralCategory('cs', 780)).toBe('many');
  });

  it('follows the last digit in Ukrainian, except inside the teens', () => {
    expect(getPluralCategory('uk', 1)).toBe('one');
    expect(getPluralCategory('uk', 21)).toBe('one');
    expect(getPluralCategory('uk', 11)).toBe('many');
    expect(getPluralCategory('uk', 3)).toBe('few');
    expect(getPluralCategory('uk', 23)).toBe('few');
    expect(getPluralCategory('uk', 13)).toBe('many');
    expect(getPluralCategory('uk', 780)).toBe('many');
  });

  it('keeps Polish 21 plural', () => {
    expect(getPluralCategory('pl', 1)).toBe('one');
    expect(getPluralCategory('pl', 21)).toBe('many');
    expect(getPluralCategory('pl', 22)).toBe('few');
  });

  it('falls back to one/many for everything else, region tags included', () => {
    expect(getPluralCategory('en', 1)).toBe('one');
    expect(getPluralCategory('en', 0)).toBe('many');
    expect(getPluralCategory('en-GB', 2)).toBe('many');
    expect(getPluralCategory('vi', 5)).toBe('many');
  });
});

describe('pluralForm', () => {
  const forms = { one: 'slovíčko', few: 'slovíčka', many: 'slovíček' };

  it('returns the form the count calls for', () => {
    expect(pluralForm(forms, 'cs', 1)).toBe('slovíčko');
    expect(pluralForm(forms, 'cs', 3)).toBe('slovíčka');
    expect(pluralForm(forms, 'cs', 30)).toBe('slovíček');
  });
});
