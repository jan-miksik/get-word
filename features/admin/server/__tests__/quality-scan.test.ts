import { describe, expect, it, vi } from 'vitest';

// `evaluateRow` is pure, but its module imports the query layer, which opens a
// database connection at import time.
vi.mock('@/lib/db/client', () => ({ db: { execute: vi.fn() } }));

import { evaluateRow, corpusKeys } from '../quality-scan';
import type { PoolRow } from '@/lib/db/queries/quality-pool';
import type { DivergenceGroup } from '@/lib/db/queries/quality-corpus';
import { suspicionScore } from '@/lib/quality-flags';

const EMPTY_SIDE = {
  readyCount: 0,
  missingCount: 1,
  failedCount: 0,
  pendingCount: 0,
  legacyCount: 0,
  assets: [],
};

function poolRow(overrides: Partial<PoolRow> = {}): PoolRow {
  const textKnown = overrides.textKnown ?? 'pes';
  const textTarget = overrides.textTarget ?? 'dog';
  return {
    poolKey: 'p1:test',
    languageFrom: 'cs',
    languageTo: 'en',
    textKnown,
    textTarget,
    normKnown: textKnown,
    normTarget: textTarget,
    occurrences: 1,
    listCount: 1,
    topics: [],
    known: { ...EMPTY_SIDE },
    target: { ...EMPTY_SIDE },
    review: null,
    ...overrides,
  };
}

const NO_CORPUS = {
  divergence: new Map<string, DivergenceGroup>(),
  categoryLeaks: new Set<string>(),
};

function codes(row: PoolRow, corpus = NO_CORPUS) {
  return evaluateRow(row, corpus).map((flag) => flag.code);
}

describe('per-pair heuristics', () => {
  /**
   * `lib/translation-validate.ts` refuses to treat an identical source and
   * target as a signal, with hotel/taxi/pizza as the reason. The scan must not
   * quietly reintroduce it.
   */
  it('does not flag a pair that is identical on both sides', () => {
    expect(codes(poolRow({ textKnown: 'hotel', textTarget: 'hotel' }))).toEqual([]);
  });

  it('does not flag an ordinary correct word pair', () => {
    expect(codes(poolRow({ textKnown: 'pes', textTarget: 'dog' }))).toEqual([]);
  });

  /**
   * The false positive a first run over real data produced: a four-word
   * collocation was treated as a sentence and reported for missing its
   * capital. Sentencehood must come from punctuation/structure, not length.
   */
  it('does not treat a multi-word collocation as a sentence', () => {
    const flags = codes(
      poolRow({
        textKnown: 'vyřešit drobné problémy',
        textTarget: 'sort out minor problems',
      }),
    );
    expect(flags).not.toContain('missing_target_capitalization');
  });

  it('still flags a real sentence that starts lowercase', () => {
    const flags = codes(
      poolRow({ textKnown: 'Je tu narváno.', textTarget: "it's packed here." }),
    );
    expect(flags).toContain('missing_target_capitalization');
  });

  it('flags a target written in the wrong script', () => {
    const flags = codes(
      poolRow({ languageTo: 'vi', textKnown: 'pes', textTarget: 'cho' }),
    );
    // Vietnamese is Latin-script, so this must NOT fire.
    expect(flags).not.toContain('looks_untranslated');

    const cyrillic = codes(
      poolRow({ languageTo: 'uk', textKnown: 'pes', textTarget: 'sobaka' }),
    );
    expect(cyrillic).toContain('looks_untranslated');
  });
});

describe('corpus heuristics', () => {
  const group: DivergenceGroup = {
    languageFrom: 'cs',
    languageTo: 'en',
    known: 'banka',
    variantCount: 2,
    groupTotal: 98,
    dominantTarget: 'bank',
    dominantCount: 97,
    variants: [
      { target: 'bank', count: 97 },
      { target: 'riverbank', count: 1 },
    ],
  };

  const corpus = {
    divergence: new Map([[corpusKeys.groupKey('cs', 'en', 'banka'), group]]),
    categoryLeaks: new Set<string>(),
  };

  /**
   * Divergence on its own is normal — polysemy and synonyms are legitimate —
   * so it must be a notice that contributes nothing to the suspicion score.
   */
  it('marks divergence as a notice that does not raise suspicion', () => {
    const flags = evaluateRow(
      poolRow({ textKnown: 'banka', textTarget: 'bank', normKnown: 'banka', normTarget: 'bank' }),
      corpus,
    );
    const divergent = flags.find((entry) => entry.code === 'divergent_targets');

    expect(divergent?.weight).toBe('notice');
    expect(flags.map((entry) => entry.code)).not.toContain('dominated_minority');
    expect(suspicionScore(flags)).toBe(0);
  });

  it('accuses the marginal variant in a lopsided split', () => {
    const flags = evaluateRow(
      poolRow({
        textKnown: 'banka',
        textTarget: 'riverbank',
        normKnown: 'banka',
        normTarget: 'riverbank',
      }),
      corpus,
    );
    const minority = flags.find((entry) => entry.code === 'dominated_minority');

    expect(minority?.weight).toBe('high');
    expect(minority?.meta?.dominantTarget).toBe('bank');
    expect(suspicionScore(flags)).toBeGreaterThan(0);
  });

  it('leaves an even split alone — two synonyms are not an error', () => {
    const evenGroup: DivergenceGroup = {
      ...group,
      groupTotal: 100,
      dominantCount: 50,
      variants: [
        { target: 'bank', count: 50 },
        { target: 'riverbank', count: 50 },
      ],
    };
    const flags = evaluateRow(
      poolRow({
        textKnown: 'banka',
        textTarget: 'riverbank',
        normKnown: 'banka',
        normTarget: 'riverbank',
      }),
      { divergence: new Map([[corpusKeys.groupKey('cs', 'en', 'banka'), evenGroup]]), categoryLeaks: new Set() },
    );

    expect(flags.map((entry) => entry.code)).toContain('divergent_targets');
    expect(flags.map((entry) => entry.code)).not.toContain('dominated_minority');
  });

  it('does not accuse a minority inside a tiny group', () => {
    const smallGroup: DivergenceGroup = {
      ...group,
      groupTotal: 4,
      dominantCount: 3,
      variants: [
        { target: 'bank', count: 3 },
        { target: 'riverbank', count: 1 },
      ],
    };
    const flags = evaluateRow(
      poolRow({
        textKnown: 'banka',
        textTarget: 'riverbank',
        normKnown: 'banka',
        normTarget: 'riverbank',
      }),
      { divergence: new Map([[corpusKeys.groupKey('cs', 'en', 'banka'), smallGroup]]), categoryLeaks: new Set() },
    );

    expect(flags.map((entry) => entry.code)).not.toContain('dominated_minority');
  });

  it('flags a category name that leaked into the word', () => {
    const flags = codes(poolRow({ textKnown: 'U lékaře', textTarget: 'At the doctor' }), {
      divergence: new Map(),
      categoryLeaks: new Set([corpusKeys.pairKey('cs', 'en', 'U lékaře', 'At the doctor')]),
    });
    expect(flags).toContain('category_name_leak');
  });
});

describe('audio heuristics', () => {
  it('judges a stored clip against its own side of the pair', () => {
    const flags = evaluateRow(
      poolRow({
        textTarget: 'a reasonably long sentence to speak',
        target: {
          readyCount: 1,
          missingCount: 0,
          failedCount: 0,
          pendingCount: 0,
          legacyCount: 0,
          assets: [{ id: 'a1', hash: 'h1', size: 500, storage: 'object_store', voice: null }],
        },
      }),
      NO_CORPUS,
    );
    const audio = flags.find((entry) => entry.code === 'audio_suspicious_size');
    expect(audio?.side).toBe('target');
  });

  /**
   * A pair with no audio must not be reported as a pair with suspicious
   * audio: the query returns an empty asset list precisely so that
   * `isSuspiciousSizeForText(null, …)` is never consulted for a missing clip.
   */
  it('says nothing about audio when there is none', () => {
    expect(codes(poolRow())).not.toContain('audio_suspicious_size');
  });
});
