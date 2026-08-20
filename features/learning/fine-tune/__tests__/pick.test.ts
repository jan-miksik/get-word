import { describe, it, expect } from 'vitest';
import type { NormalizedWord } from '@/lib/words';
import { DEFAULT_FINE_TUNE_CONFIG, normalizeFineTuneConfig } from '../config';
import { pickExerciseForWord, pickMatchRound } from '../pick';
import type { FineTuneConfig, StageConfig } from '../types';

const word = (id: string, cz: string, vi: string): NormalizedWord => ({
  id, cz, vi, en: '', category: ['word'],
});

/**
 * A pool with no near-twins at all, so band II/III always has to degrade.
 * The words must not share a prefix either — a common stem alone is enough to
 * reach band II.
 */
const STEMS = [
  'pes', 'stul', 'kolo', 'mesto', 'ryba', 'chleb', 'zahrada', 'oblak',
  'kniha', 'vlak', 'jablko', 'hodiny', 'lampa', 'kridlo', 'more', 'silnice',
];
const distinctPool = (size: number): NormalizedWord[] =>
  Array.from({ length: size }, (_, i) =>
    word(`w${i}`, `${STEMS[i % STEMS.length]}${i}`, `${STEMS[(i + 7) % STEMS.length]}q${i}`),
  );

const stage = (overrides: Partial<StageConfig>): StageConfig => ({
  reveal: { weight: 1, variants: [] },
  choice: { weight: 1, variants: [] },
  typing: { weight: 1, variants: [] },
  assembly: { weight: 1, variants: [] },
  match: { variants: [] },
  ...overrides,
});

const configWithStage = (stageIndex: number, value: StageConfig): FineTuneConfig => {
  const stages = DEFAULT_FINE_TUNE_CONFIG.stages.map((entry) => entry);
  stages[stageIndex] = value;
  return { version: 3, stages };
};

const distribution = (
  config: FineTuneConfig,
  stageIndex: number,
  pool: NormalizedWord[],
  samples = 4000,
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (let i = 0; i < samples; i += 1) {
    const target = pool[i % pool.length];
    const exercise = pickExerciseForWord({
      word: target,
      stageIndex,
      knownCount: 1 + Math.floor(i / pool.length),
      unknownCount: 0,
      config,
      distractorPool: pool,
      role: 'knownLanguage',
    });
    counts[exercise.method] = (counts[exercise.method] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [key, value / samples]),
  );
};

describe('pickExerciseForWord — method weighting', () => {
  it('gives a method its weight regardless of how many variants it has', () => {
    // Reveal has one variant, choice has seven. Without the two-step pick this
    // would come out roughly 1:7 instead of the configured 1:1.
    const pool = distinctPool(12);
    const config = configWithStage(
      3,
      stage({
        reveal: { weight: 2, variants: ['known'] },
        choice: { weight: 2, variants: ['2:I', '3:I', '4:I', '5:I', '6:I', '7:I', '8:I'] },
      }),
    );

    const shares = distribution(config, 3, pool);
    expect(shares.reveal).toBeGreaterThan(0.42);
    expect(shares.reveal).toBeLessThan(0.58);
    expect(shares.choice).toBeGreaterThan(0.42);
    expect(shares.choice).toBeLessThan(0.58);
  });

  it('shares the balanced 3-day stage across its available methods', () => {
    const pool = distinctPool(12);
    const shares = distribution(DEFAULT_FINE_TUNE_CONFIG, 3, pool);
    expect(shares.reveal).toBeGreaterThan(0.34);
    expect(shares.reveal).toBeLessThan(0.46);
    expect(shares.typing).toBeGreaterThan(0.14);
    expect(shares.typing).toBeLessThan(0.26);
    expect(shares.choice).toBeGreaterThan(0.14);
    expect(shares.choice).toBeLessThan(0.26);
    expect(shares.assembly).toBeGreaterThan(0.14);
    expect(shares.assembly).toBeLessThan(0.26);
  });

  it('redistributes weight when a method drops out for lack of words', () => {
    // Only three words exist, so every choice variant here needs more options
    // than the list can supply and choice falls away entirely.
    const pool = distinctPool(3);
    const config = configWithStage(
      3,
      stage({
        reveal: { weight: 1, variants: ['known'] },
        choice: { weight: 1, variants: ['6:I', '7:I', '8:I'] },
      }),
    );
    const shares = distribution(config, 3, pool);
    expect(shares.choice).toBeUndefined();
    expect(shares.reveal).toBe(1);
  });
});

describe('pickExerciseForWord — determinism and fallbacks', () => {
  it('returns the same exercise for the same word and review count', () => {
    const pool = distinctPool(12);
    const input = {
      word: pool[0],
      stageIndex: 3,
      knownCount: 2,
      unknownCount: 1,
      config: DEFAULT_FINE_TUNE_CONFIG,
      distractorPool: pool,
      role: 'knownLanguage' as const,
    };
    const first = pickExerciseForWord(input);
    const second = pickExerciseForWord(input);
    expect(second).toEqual(first);
  });

  it('reshuffles once the word has been reviewed again', () => {
    const pool = distinctPool(12);
    const base = {
      word: pool[0],
      stageIndex: 3,
      unknownCount: 0,
      config: DEFAULT_FINE_TUNE_CONFIG,
      distractorPool: pool,
      role: 'knownLanguage' as const,
    };
    const seen = new Set(
      Array.from({ length: 20 }, (_, i) =>
        JSON.stringify(pickExerciseForWord({ ...base, knownCount: i + 1 })),
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('shows the answer for a word that has never been got right', () => {
    const pool = distinctPool(12);
    expect(
      pickExerciseForWord({
        word: pool[0],
        stageIndex: 7,
        knownCount: 0,
        unknownCount: 3,
        config: DEFAULT_FINE_TUNE_CONFIG,
        distractorPool: pool,
        role: 'knownLanguage',
      }),
    ).toEqual({ method: 'reveal', variant: 'foreign' });
  });

  it('falls back to reveal when a stage somehow has nothing to offer', () => {
    const config = normalizeFineTuneConfig({
      version: 3,
      stages: [stage({}), stage({}), stage({}), stage({}), stage({}), stage({}), stage({}), stage({})],
    });
    const pool = distinctPool(12);
    const exercise = pickExerciseForWord({
      word: pool[0],
      stageIndex: 5,
      knownCount: 4,
      unknownCount: 0,
      config,
      distractorPool: pool,
      role: 'knownLanguage',
    });
    expect(exercise).toEqual({ method: 'reveal', variant: 'foreign' });
  });
});

describe('pickExerciseForWord — similarity degradation', () => {
  it('keeps the option count and lowers the band when no twins exist', () => {
    const pool = distinctPool(12);
    const config = configWithStage(5, stage({ choice: { weight: 1, variants: ['6:III'] } }));
    const exercise = pickExerciseForWord({
      word: pool[0],
      stageIndex: 5,
      knownCount: 3,
      unknownCount: 0,
      config,
      distractorPool: pool,
      role: 'knownLanguage',
    });

    expect(exercise.method).toBe('choice');
    if (exercise.method !== 'choice') return;
    expect(exercise.distractors).toHaveLength(5);
    expect(exercise.requestedBand).toBe('III');
    expect(exercise.effectiveBand).toBe('I');
  });

  it('keeps the requested band when twins are available', () => {
    const pool = [
      word('a', 'fér', 'aaa'),
      word('b', 'fén', 'bbb'),
      word('c', 'fůr', 'ccc'),
      word('d', 'zcela-jine', 'ddd'),
      word('e', 'naprosto-odlisne', 'eee'),
    ];
    const config = configWithStage(5, stage({ choice: { weight: 1, variants: ['3:III'] } }));
    const exercise = pickExerciseForWord({
      word: pool[0],
      stageIndex: 5,
      knownCount: 3,
      unknownCount: 0,
      config,
      distractorPool: pool,
      role: 'knownLanguage',
    });

    expect(exercise.method).toBe('choice');
    if (exercise.method !== 'choice') return;
    expect(exercise.effectiveBand).toBe('III');
    expect(exercise.distractors).toHaveLength(2);
  });
});

describe('pickExerciseForWord — assembly', () => {
  it('builds a letter round with exactly the target letters when configured', () => {
    const pool = [word('a', 'dog', 'mèo'), ...distinctPool(4)];
    const config = configWithStage(
      4,
      stage({ assembly: { weight: 1, variants: ['letters:exact'] } }),
    );
    const exercise = pickExerciseForWord({
      word: pool[0],
      stageIndex: 4,
      knownCount: 2,
      unknownCount: 0,
      config,
      distractorPool: pool,
      role: 'knownLanguage',
    });

    expect(exercise).toEqual({
      method: 'assembly',
      variant: 'letters:exact',
      answerParts: ['m', 'è', 'o'],
      distractorParts: [],
    });
  });

  it('uses word tiles for a phrase and adds noise on the harder variant', () => {
    const pool = [
      word('a', 'good day', 'xin chào bạn'),
      word('b', 'thank you', 'cảm ơn nhiều'),
      word('c', 'see you', 'hẹn gặp lại'),
    ];
    const config = configWithStage(
      4,
      stage({ assembly: { weight: 1, variants: ['words:extra'] } }),
    );
    const exercise = pickExerciseForWord({
      word: pool[0],
      stageIndex: 4,
      knownCount: 2,
      unknownCount: 0,
      config,
      distractorPool: pool,
      role: 'knownLanguage',
    });

    expect(exercise.method).toBe('assembly');
    if (exercise.method !== 'assembly') return;
    expect(exercise.answerParts).toEqual(['xin', 'chào', 'bạn']);
    expect(exercise.distractorParts.length).toBeGreaterThan(0);
  });
});

describe('pickMatchRound', () => {
  it('returns null on a stage that allows no matching', () => {
    const pool = distinctPool(12);
    expect(
      pickMatchRound({
        anchor: pool[0],
        stageIndex: 7,
        config: DEFAULT_FINE_TUNE_CONFIG,
        pool,
        seed: 1,
      }),
    ).toBeNull();
  });

  it('builds a round of the configured size', () => {
    const pool = distinctPool(12);
    const round = pickMatchRound({
      anchor: pool[0],
      stageIndex: 2,
      config: DEFAULT_FINE_TUNE_CONFIG,
      pool,
      seed: 7,
    });
    expect(round).not.toBeNull();
    expect([4, 6]).toContain(round!.words.length);
    expect(round!.words[0].id).toBe(pool[0].id);
  });
});
