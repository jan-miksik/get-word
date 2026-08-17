import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ db: { execute: vi.fn() } }));

import { pickCanonicalText, mayLink, hasUsableAudio } from '../quality-audio';
import type { PoolItem } from '@/lib/db/queries/quality-pool';

function item(overrides: Partial<PoolItem> = {}): PoolItem {
  return {
    itemId: 'i1',
    listId: 'l1',
    textKnown: 'pes',
    textTarget: 'dog',
    languageFrom: 'cs',
    languageTo: 'en',
    knownAudioStatus: 'none',
    targetAudioStatus: 'none',
    knownAsset: null,
    targetAsset: null,
    ...overrides,
  };
}

const playable = { contentHash: 'h', storageType: 'object_store', storageRef: 'ref' };
const legacyR2 = { contentHash: 'h', storageType: 'r2', storageRef: 'ref' };

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

describe('overwrite gate', () => {
  /**
   * The regression this exists for: the admin button appears as soon as ONE
   * occurrence lacks audio, and linking every text-equivalent item would then
   * replace the good clips of everyone else in the pair — editors overwriting
   * recordings inside private lists to fix somebody else's gap.
   */
  it('keeps a clip a learner can already play', () => {
    expect(
      hasUsableAudio(item({ targetAudioStatus: 'ready', targetAsset: playable }), 'target'),
    ).toBe(true);
  });

  it('treats every non-ready status as a gap to fill', () => {
    for (const status of ['none', 'pending', 'failed']) {
      expect(
        hasUsableAudio(item({ targetAudioStatus: status, targetAsset: playable }), 'target'),
      ).toBe(false);
    }
  });

  /**
   * `ready` alone is not enough. A legacy `r2` row is linked but unplayable —
   * the serve route 404s for it — and repairing exactly those is half the
   * point of the tool, so the asset is judged rather than the status column.
   */
  it('replaces a ready-but-unplayable legacy clip', () => {
    expect(
      hasUsableAudio(item({ targetAudioStatus: 'ready', targetAsset: legacyR2 }), 'target'),
    ).toBe(false);
  });

  it('reads a status with no asset behind it as a gap', () => {
    expect(
      hasUsableAudio(item({ targetAudioStatus: 'ready', targetAsset: null }), 'target'),
    ).toBe(false);
  });

  it('judges each side on its own', () => {
    const oneSided = item({
      knownAudioStatus: 'ready',
      knownAsset: playable,
      targetAudioStatus: 'none',
    });
    expect(hasUsableAudio(oneSided, 'known')).toBe(true);
    expect(hasUsableAudio(oneSided, 'target')).toBe(false);
  });
});
