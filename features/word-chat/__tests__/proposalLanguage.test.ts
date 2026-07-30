import { describe, expect, it } from 'vitest';
import { proposalLanguageIssue } from '../proposalLanguage';

function items(texts: string[]) {
  return texts.map((text) => ({ text }));
}

describe('proposalLanguageIssue', () => {
  it('flags a batch written in English for a Czech learner', () => {
    expect(
      proposalLanguageIssue({
        languageFrom: 'cs',
        items: items([
          'Could you split the bill?',
          'I think this item was charged twice.',
          'Where is the entrance?',
          'bill',
        ]),
      }),
    ).toMatch(/look like English/);
  });

  it('passes a Czech batch', () => {
    expect(
      proposalLanguageIssue({
        languageFrom: 'cs',
        items: items([
          'Můžete to rozdělit na dva účty?',
          'Zdá se, že tato položka byla účtována dvakrát.',
          'Kde je vchod?',
          'účet',
        ]),
      }),
    ).toBeNull();
  });

  it('passes batches in other languages whose common words resemble English ones', () => {
    // "was", "man", "die" (de), "no", "con" (es), "on", "en" (fr) and "to", "a",
    // "do" (cs) are deliberately not markers, so these must stay clean.
    expect(
      proposalLanguageIssue({
        languageFrom: 'de',
        items: items([
          'Was kostet die Fahrkarte?',
          'Ich hätte gern einen Kaffee.',
          'Wo ist der Ausgang?',
        ]),
      }),
    ).toBeNull();
    expect(
      proposalLanguageIssue({
        languageFrom: 'es',
        items: items([
          '¿Me puede traer la cuenta?',
          'No estoy de acuerdo con este cargo.',
          '¿Dónde está la entrada?',
        ]),
      }),
    ).toBeNull();
  });

  it('never flags a learner who already reads English', () => {
    expect(
      proposalLanguageIssue({
        languageFrom: 'en',
        items: items([
          'Could you split the bill?',
          'I think this item was charged twice.',
        ]),
      }),
    ).toBeNull();
  });

  it('ignores a single English-looking line in an otherwise fine batch', () => {
    expect(
      proposalLanguageIssue({
        languageFrom: 'cs',
        items: items([
          'Můžete to rozdělit na dva účty?',
          'Zdá se, že tato položka byla účtována dvakrát.',
          'Could you split the bill?',
        ]),
      }),
    ).toBeNull();
  });
});
