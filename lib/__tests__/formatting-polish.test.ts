import { describe, expect, it } from 'vitest';
import { polishPair } from '@/lib/formatting-polish';

// Helper: polish a single field by pairing it with an empty counterpart.
function polishOne(text: string, lang: string) {
  return polishPair({ text, lang }, { text: '', lang: 'xx' }).source;
}

describe('polishPair — sentence fixes', () => {
  it('capitalizes and adds a period to a clear English sentence', () => {
    const r = polishOne("i don't understand", 'en');
    expect(r.fixed).toBe("I don't understand.");
    expect(r.changed).toBe(true);
  });

  it('capitalizes a question but warns instead of inserting "?"', () => {
    const r = polishOne('what is this', 'en');
    expect(r.fixed).toBe('What is this');
    expect(r.warnings.map((w) => w.code)).toContain('maybe_question');
  });

  it('fixes a 3+ word Czech sentence flagged by a pronoun', () => {
    expect(polishOne('bolí mě tělo', 'cs').fixed).toBe('Bolí mě tělo.');
  });

  it('only fixes casing when the period is already present', () => {
    expect(polishOne('i understand.', 'en').fixed).toBe('I understand.');
  });
});

describe('polishPair — phrases stay untouched', () => {
  const phrases: Array<[string, string]> = [
    ['Good day', 'en'],
    ['Dobrý den', 'cs'],
    ['Petr and Jan', 'en'],
    ['the white one', 'en'],
    ['in the city', 'en'],
    ['from Prague', 'en'],
  ];
  for (const [text, lang] of phrases) {
    it(`leaves "${text}" unchanged`, () => {
      const r = polishOne(text, lang);
      expect(r.fixed).toBe(text);
      expect(r.changed).toBe(false);
    });
  }
});

describe('polishPair — whitespace (always safe)', () => {
  it('trims, collapses runs, and tightens space before punctuation', () => {
    expect(polishOne('  Hello !  ', 'en').fixed).toBe('Hello!');
    expect(polishOne('a   b', 'en').fixed).toBe('a b');
  });

  it('keeps French spacing before high punctuation', () => {
    expect(polishOne('Bonjour !', 'fr').fixed).toBe('Bonjour !');
    expect(polishOne('Bonjour  ,', 'fr').fixed).toBe('Bonjour,');
  });

  it('keeps the space before a trailing ellipsis but tightens a lone period', () => {
    const ellipsis = polishOne('Já jsem ...', 'cs');
    expect(ellipsis.fixed).toBe('Já jsem ...');
    expect(ellipsis.changed).toBe(false);
    expect(polishOne('Hello .', 'en').fixed).toBe('Hello.');
  });
});

describe('polishPair — symmetry & short drills', () => {
  it('promotes a one-word translation to a sentence when its partner is one', () => {
    const { target } = polishPair(
      { text: 'I do not understand.', lang: 'en' },
      { text: 'nerozumím', lang: 'cs' },
    );
    expect(target.fixed).toBe('Nerozumím.');
  });

  it('leaves a pair untouched when neither side is a sentence', () => {
    const { source, target } = polishPair(
      { text: 'I am', lang: 'en' },
      { text: 'jsem', lang: 'cs' },
    );
    expect(source.changed).toBe(false);
    expect(target.changed).toBe(false);
  });

  it('keeps a short conjugation drill as a phrase on its own', () => {
    expect(polishOne('pomozte mi', 'cs').changed).toBe(false);
  });

  it('warns "needs ?" across the pair when a side is an interrogative', () => {
    const { target } = polishPair(
      { text: 'Where is it?', lang: 'en' },
      { text: 'kde to je', lang: 'cs' },
    );
    expect(target.warnings.map((w) => w.code)).toContain('maybe_question');
    expect(target.fixed).toBe('Kde to je'); // capitalized, no period guess
  });
});

describe('polishPair — non-casing languages', () => {
  it('does not capitalize or add a period for Arabic, only whitespace', () => {
    const r = polishOne('  مرحبا  بك  ', 'ar');
    expect(r.fixed).toBe('مرحبا بك');
    expect(r.fixes.every((f) => f.code === 'trim' || f.code === 'collapse_spaces')).toBe(true);
  });
});
