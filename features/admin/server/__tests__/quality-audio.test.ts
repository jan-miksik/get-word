import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ db: { execute: vi.fn() } }));

const getGoogleVoicesForLanguage = vi.fn();
vi.mock('@/lib/language-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/language-catalog')>();
  return {
    ...actual,
    getGoogleVoicesForLanguage: (...args: [string]) => getGoogleVoicesForLanguage(...args),
  };
});

import {
  pickCanonicalText,
  mayLink,
  hasUsableAudio,
  resolvePoolVoice,
} from '../quality-audio';
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

const playable = { contentHash: 'h', storageType: 'object_store', storageRef: 'ref', voiceId: null };
const legacyR2 = { contentHash: 'h', storageType: 'r2', storageRef: 'ref', voiceId: null };

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

describe('resolvePoolVoice', () => {
  beforeEach(() => {
    getGoogleVoicesForLanguage.mockReset();
  });

  /**
   * The pool must speak with the same voices as the list editor. A clip
   * recorded here under Google's default voice hashes differently from the
   * same word recorded from a list, so every pair would be synthesized twice
   * and read by a different narrator depending on where it came from.
   */
  it('picks a Chirp3-HD voice and ignores the rest of the catalog', async () => {
    getGoogleVoicesForLanguage.mockResolvedValue([
      'cs-CZ-Standard-A',
      'cs-CZ-Chirp3-HD-Aoede',
      'cs-CZ-Chirp3-HD-Puck',
      'cs-CZ-Wavenet-B',
    ]);

    const voice = await resolvePoolVoice('pes', 'cs');
    expect(voice).toEqual({
      supported: true,
      voiceId: expect.stringContaining('Chirp3-HD'),
    });
  });

  /** Same text, same voice — that is what keeps the content hash reusable. */
  it('is deterministic for the same text', async () => {
    getGoogleVoicesForLanguage.mockResolvedValue([
      'cs-CZ-Chirp3-HD-Aoede',
      'cs-CZ-Chirp3-HD-Puck',
    ]);

    const first = await resolvePoolVoice('pes', 'cs');
    const second = await resolvePoolVoice('pes', 'cs');
    expect(first).toEqual(second);
  });

  /**
   * Māori is the case that prompted this: Google offers no voice at all, and
   * the pool used to spend a synthesis call to come back with a bare 422.
   */
  it('reports a language Google cannot speak instead of trying anyway', async () => {
    getGoogleVoicesForLanguage.mockResolvedValue([]);
    expect(await resolvePoolVoice('hiahia', 'mi')).toEqual({ supported: false });
  });

  /**
   * A catalog that could not be fetched says nothing about what Google can
   * speak — that must not be mistaken for an unsupported language.
   */
  it('degrades to the default voice when the catalog cannot be read', async () => {
    getGoogleVoicesForLanguage.mockRejectedValue(new Error('network'));
    expect(await resolvePoolVoice('pes', 'cs')).toEqual({
      supported: true,
      voiceId: 'default',
    });
  });

  it('uses an explicitly requested voice without consulting the catalog', async () => {
    expect(
      await resolvePoolVoice('pes', 'cs', { kind: 'explicit', voiceId: 'cs-CZ-Studio-A' }),
    ).toEqual({
      supported: true,
      voiceId: 'cs-CZ-Studio-A',
    });
    expect(getGoogleVoicesForLanguage).not.toHaveBeenCalled();
  });

  /**
   * The whole point of the mix: re-recording under the deterministic pick
   * would resolve to the same voice, hash to the same asset and change
   * nothing, so a random pick is what makes "record again" audible.
   */
  it('avoids the voices the pair is already recorded in', async () => {
    getGoogleVoicesForLanguage.mockResolvedValue([
      'cs-CZ-Standard-A',
      'cs-CZ-Chirp3-HD-Aoede',
      'cs-CZ-Chirp3-HD-Puck',
    ]);

    for (let attempt = 0; attempt < 20; attempt++) {
      expect(
        await resolvePoolVoice('pes', 'cs', { kind: 'random' }, ['cs-CZ-Chirp3-HD-Aoede']),
      ).toEqual({ supported: true, voiceId: 'cs-CZ-Chirp3-HD-Puck' });
    }
  });

  /** One Chirp3-HD voice is still a recording, not a failure. */
  it('reuses the only voice there is rather than refusing', async () => {
    getGoogleVoicesForLanguage.mockResolvedValue(['cs-CZ-Chirp3-HD-Aoede']);
    expect(
      await resolvePoolVoice('pes', 'cs', { kind: 'random' }, ['cs-CZ-Chirp3-HD-Aoede']),
    ).toEqual({ supported: true, voiceId: 'cs-CZ-Chirp3-HD-Aoede' });
  });

  /** A language with voices but no Chirp3-HD one still gets recorded. */
  it('falls back to the default voice when the language has no Chirp3-HD voice', async () => {
    getGoogleVoicesForLanguage.mockResolvedValue(['vi-VN-Standard-A']);
    expect(await resolvePoolVoice('xin chào', 'vi')).toEqual({
      supported: true,
      voiceId: 'default',
    });
  });
});
