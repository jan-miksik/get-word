import { describe, expect, it } from 'vitest';
import {
  hasBinaryAddressForms,
  makeAddressForm,
  normalizeWordItemAddressForm,
  oppositeAddressForm,
} from '@/lib/word-item-address-form';

describe('hasBinaryAddressForms', () => {
  it('accepts the languages with exactly two canonical address forms', () => {
    for (const code of ['cs', 'sk', 'ru', 'uk', 'de', 'fr', 'it', 'nl', 'el', 'ro']) {
      expect(hasBinaryAddressForms(code)).toBe(true);
    }
  });

  it('rejects languages whose polite form is not a single wording', () => {
    // Each of these would make the model invent a canonical "polite" rendering
    // that does not exist:
    //  - vi picks the pronoun from age/gender/relationship
    //  - ja/ko/th have several politeness levels, not two
    //  - pl needs the addressee's gender and number (Pan / Pani / Państwo)
    for (const code of ['vi', 'ja', 'ko', 'th', 'id', 'hi', 'pl']) {
      expect(hasBinaryAddressForms(code)).toBe(false);
    }
  });

  it('is narrower than the loose register-sensitivity check', async () => {
    const { hasRegisterDistinction } = await import('@/features/word-chat/registerLanguages');
    // pl and vi mark address, but not in a way that yields a pair. Conflating
    // the two predicates is exactly the bug this separation prevents.
    expect(hasRegisterDistinction('pl')).toBe(true);
    expect(hasBinaryAddressForms('pl')).toBe(false);
    expect(hasRegisterDistinction('vi')).toBe(true);
    expect(hasBinaryAddressForms('vi')).toBe(false);
  });

  it('reads the base language out of a regional code, and refuses empty input', () => {
    expect(hasBinaryAddressForms('de-AT')).toBe(true);
    expect(hasBinaryAddressForms('')).toBe(false);
  });
});

describe('normalizeWordItemAddressForm', () => {
  it('keeps a well-formed value', () => {
    expect(normalizeWordItemAddressForm({ version: 1, form: 'polite', groupId: 'g1' })).toEqual({
      version: 1,
      form: 'polite',
      groupId: 'g1',
    });
  });

  it('drops anything malformed rather than repairing it', () => {
    expect(normalizeWordItemAddressForm(null)).toBeNull();
    expect(normalizeWordItemAddressForm({ form: 'polite' })).toBeNull();
    expect(normalizeWordItemAddressForm({ version: 2, form: 'polite' })).toBeNull();
    expect(normalizeWordItemAddressForm({ version: 1, form: 'formal' })).toBeNull();
    expect(normalizeWordItemAddressForm([{ version: 1, form: 'polite' }])).toBeNull();
  });

  it('drops an unusable groupId but keeps the form, which is still true', () => {
    expect(normalizeWordItemAddressForm({ version: 1, form: 'familiar', groupId: '  ' })).toEqual({
      version: 1,
      form: 'familiar',
    });
    expect(
      normalizeWordItemAddressForm({ version: 1, form: 'familiar', groupId: 'x'.repeat(65) }),
    ).toEqual({ version: 1, form: 'familiar' });
  });

  it('omits groupId entirely when no pair survived', () => {
    expect(makeAddressForm('familiar')).toEqual({ version: 1, form: 'familiar' });
    expect(makeAddressForm('familiar', 'g1')).toEqual({
      version: 1,
      form: 'familiar',
      groupId: 'g1',
    });
  });

  it('flips to the other form', () => {
    expect(oppositeAddressForm('familiar')).toBe('polite');
    expect(oppositeAddressForm('polite')).toBe('familiar');
  });
});
