import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ db: { execute: vi.fn() } }));

import { pickCanonicalText, mayLink } from '../quality-audio';

describe('pickCanonicalText', () => {
  /**
   * A pool row folds case, whitespace and trailing dots together, so the
   * variants behind it can include a typo. Taking the alphabetically first one
   * would happily synthesize that typo for everybody.
   */
  it('picks the most common spelling, not the alphabetically first', () => {
    const variants = ['aardvark', 'Hello', 'Hello', 'Hello'];
    expect(pickCanonicalText(variants)).toBe('Hello');
  });

  it('prefers the spelling without a trailing dot when counts tie', () => {
    expect(pickCanonicalText(['Hello.', 'Hello'])).toBe('Hello');
  });

  it('is stable when everything ties', () => {
    expect(pickCanonicalText(['b', 'a'])).toBe('a');
  });

  it('survives a single variant', () => {
    expect(pickCanonicalText(['pes'])).toBe('pes');
  });
});

describe('clip sharing gate', () => {
  /**
   * The repo's real invariant is audio-equivalence, not exact text:
   * `updateItemTranslations` already keeps a clip across cosmetic edits, so an
   * item reading "Hello." legitimately points at a recording of "Hello".
   */
  it('shares a clip across cosmetic spelling differences', () => {
    expect(mayLink('Hello.', 'Hello')).toBe(true);
    expect(mayLink('hello', 'Hello')).toBe(true);
    expect(mayLink('  Hello  ', 'Hello')).toBe(true);
  });

  it('refuses to share a clip between genuinely different words', () => {
    expect(mayLink('Goodbye', 'Hello')).toBe(false);
  });

  /**
   * The one hole the pool key leaves open: `normalizeAudioText` does not
   * normalize Unicode form while the pool key does, so an NFD spelling shares
   * a pool key with its NFC twin. Normalizing before the comparison is what
   * keeps those items linkable instead of silently left behind.
   */
  it('treats NFC and NFD spellings of the same word as the same clip', () => {
    const nfc = 'unavený'.normalize('NFC');
    const nfd = 'unavený'.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    expect(mayLink(nfd, nfc)).toBe(true);
  });
});
