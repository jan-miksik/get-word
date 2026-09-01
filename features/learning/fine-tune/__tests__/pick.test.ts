import { describe, it, expect } from 'vitest';
import type { NormalizedWord } from '@/lib/words';
import { DEFAULT_FINE_TUNE_CONFIG, normalizeFineTuneConfig } from '../config';
import { pickExerciseForWord, pickMatchRound } from '../pick';
import type { ChoiceVariant, FineTuneConfig, StageConfig } from '../types';
import { bandAtLeast, similarityBandForTerms } from '@/features/learning/minigames/similarity';

const word = (id: string, cz: string, vi: string): NormalizedWord => ({
  id, cz, vi, en: '', category: ['word'],
});

/**
 * A pool with no near-twins at all. The words must not share a prefix either —
 * a common stem alone is enough to reach band II.
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
  return { version: 5, stages };
};

const distribution = (
  config: FineTuneConfig,
  stageIndex: number,
  pool: NormalizedWord[],
  samples = 1000,
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
        choice: { weight: 2, variants: [
          '2:I:foreign', '3:I:foreign', '4:I:foreign', '5:I:foreign',
          '6:I:foreign', '7:I:foreign', '8:I:foreign',
        ] },
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
        choice: { weight: 1, variants: ['6:I:foreign', '7:I:foreign', '8:I:foreign'] },
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

describe('pickExerciseForWord — minimum similarity', () => {
  it('invents near-twins instead of lowering a 7-day word below III', () => {
    const pool = distinctPool(12);
    const config = configWithStage(4, stage({
      choice: { weight: 1, variants: ['6:III:foreign'] },
    }));
    const exercise = pickExerciseForWord({
      word: pool[0],
      stageIndex: 4,
      knownCount: 3,
      unknownCount: 0,
      config,
      distractorPool: pool,
      role: 'knownLanguage',
    });

    expect(exercise.method).toBe('choice');
    if (exercise.method !== 'choice') return;
    expect(exercise.requestedBand).toBe('III');
    expect(exercise.effectiveBand).toBe('III');
    expect(exercise.distractors.some((entry) => entry.id.startsWith('invented:'))).toBe(true);
  });

  it('keeps the requested band when twins are available', () => {
    const pool = [
      word('a', 'fér', 'aaa'),
      word('b', 'fén', 'bbb'),
      word('c', 'fůr', 'ccc'),
      word('d', 'zcela-jine', 'ddd'),
      word('e', 'naprosto-odlisne', 'eee'),
    ];
    const config = configWithStage(5, stage({ choice: { weight: 1, variants: ['3:III:known'] } }));
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

  it('rejects a variant when the displayed side cannot meet its requested band', () => {
    // Near-twins on the known side only. Asking for foreign options therefore
    // has nothing hard to offer, even though the same pool is band III the
    // other way round.
    const pool = [
      word('a', 'fér', 'aaa jedna'),
      word('b', 'fén', 'bbb dve'),
      word('c', 'fůr', 'ccc tri'),
      word('d', 'zcela-jine', 'ddd ctyri'),
      word('e', 'naprosto-odlisne', 'eee pet'),
    ];
    const resolve = (variants: ChoiceVariant[]) => {
      const exercise = pickExerciseForWord({
        word: pool[0],
        stageIndex: 5,
        knownCount: 3,
        unknownCount: 0,
        config: configWithStage(5, stage({ choice: { weight: 1, variants } })),
        distractorPool: pool,
        role: 'knownLanguage',
      });
      return exercise;
    };

    const known = resolve(['3:III:known']);
    expect(known.method).toBe('choice');
    if (known.method !== 'choice') return;
    expect(known.effectiveBand).toBe('III');
    const foreign = resolve(['3:III:foreign']);
    expect(foreign).toEqual({ method: 'reveal', variant: 'foreign' });
  });
});

describe('pickExerciseForWord — assembly', () => {
  it('builds a letter round with exactly the target letters when configured', () => {
    const pool = [word('a', 'dog', 'mèo'), ...distinctPool(4)];
    const config = configWithStage(
      4,
      stage({ assembly: { weight: 1, variants: ['letters:I'] } }),
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
      variant: 'letters:I',
      effectiveBand: 'I',
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
      stage({ assembly: { weight: 1, variants: ['words:II'] } }),
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
    // Every tile has to be worth reading. The list holds nothing close enough
    // to the phrase's own words, so most of these are bent forms of the answer
    // itself — and none of them is the punctuation the old fallback served.
    expect(exercise.effectiveBand).toBe('II');
    for (const part of exercise.distractorParts) {
      expect(
        exercise.answerParts.some(
          (answer) => bandAtLeast(similarityBandForTerms(part, answer), 'II'),
        ),
      ).toBe(true);
    }
  });

  it('makes every extra letter confusable above band I, and offers more of them on III', () => {
    const pool = [word('target', 'demo', 'raco'), ...distinctPool(8)];
    const baseLetter = (value: string) => value
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
    const correctBases = new Set(['r', 'a', 'c', 'o']);

    const confusableCount = (variant: 'letters:II' | 'letters:III') => {
      const exercise = pickExerciseForWord({
        word: pool[0],
        stageIndex: 3,
        knownCount: 2,
        unknownCount: 0,
        config: configWithStage(3, stage({ assembly: { weight: 1, variants: [variant] } })),
        distractorPool: pool,
        role: 'knownLanguage',
      });
      expect(exercise.method).toBe('assembly');
      if (exercise.method !== 'assembly') return { similar: 0, total: 0, band: 'I' as const };
      return {
        similar: exercise.distractorParts.filter((part) => correctBases.has(baseLetter(part))).length,
        total: exercise.distractorParts.length,
        band: exercise.effectiveBand,
      };
    };

    // II stays a lighter board than III: fewer tiles, all of them confusable.
    expect(confusableCount('letters:II')).toEqual({ similar: 2, total: 2, band: 'II' });
    expect(confusableCount('letters:III')).toEqual({ similar: 5, total: 5, band: 'III' });
  });

  it('uses another method rather than lowering an assembly variant below its band', () => {
    const pool = [
      word('a', 'known phrase', 'alpha beta'),
      word('b', 'other one', 'gamma delta'),
      word('c', 'another one', 'epsilon zeta'),
      word('d', 'last one', 'theta iota'),
    ];
    const config = configWithStage(3, stage({
      assembly: { weight: 1, variants: ['words:III'] },
      typing: { weight: 1, variants: ['50:90'] },
    }));

    const exercise = pickExerciseForWord({
      word: pool[0],
      stageIndex: 3,
      knownCount: 2,
      unknownCount: 0,
      config,
      distractorPool: pool,
      role: 'knownLanguage',
    });

    expect(exercise).toEqual({ method: 'typing', variant: '50:90' });
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
    expect([2, 3, 4, 5, 6]).toContain(round!.words.length);
    expect(round!.words[0].id).toBe(pool[0].id);
  });

  it('skips a 7-day round when the pool cannot meet level III', () => {
    const pool = distinctPool(12);
    expect(
      pickMatchRound({
        anchor: pool[0],
        stageIndex: 4,
        config: DEFAULT_FINE_TUNE_CONFIG,
        pool,
        seed: 7,
      }),
    ).toBeNull();
  });
});

describe('pickExerciseForWord — invented lookalikes', () => {
  // A Vietnamese-side list with no near-twins in it at all: any band III round
  // built from this pool alone would have to degrade.
  const vietnamesePool = (): NormalizedWord[] => [
    word('a', 'matka', 'người'),
    word('b', 'dům', 'nhà'),
    word('c', 'kniha', 'sách'),
    word('d', 'voda', 'nước'),
    word('e', 'stůl', 'bàn'),
    word('f', 'chleba', 'bánh mì'),
    word('g', 'zahrada', 'vườn'),
    word('h', 'oblak', 'mây'),
  ];

  const chooseWith = (variant: ChoiceVariant, pool: NormalizedWord[]) => {
    const config = configWithStage(5, stage({ choice: { weight: 1, variants: [variant] } }));
    const exercise = pickExerciseForWord({
      word: pool[0],
      stageIndex: 5,
      knownCount: 3,
      unknownCount: 0,
      config,
      distractorPool: pool,
      role: 'knownLanguage',
    });
    if (exercise.method !== 'choice') throw new Error(`expected choice, got ${exercise.method}`);
    return exercise;
  };

  const inventedIn = (exercise: { distractors: NormalizedWord[] }) =>
    exercise.distractors.filter((entry) => entry.id.startsWith('invented:'));

  it('reaches band III on a list that holds no real near-twins', () => {
    const exercise = chooseWith('5:III:foreign', vietnamesePool());
    expect(exercise.effectiveBand).toBe('III');
    expect(inventedIn(exercise).length).toBeGreaterThan(0);
    expect(exercise.distractors).toHaveLength(4);
  });

  it('caps invented options at two even when a small round needs both of them', () => {
    for (const variant of ['3:III:foreign', '5:III:foreign', '8:III:foreign'] as ChoiceVariant[]) {
      const exercise = chooseWith(variant, vietnamesePool());
      const invented = inventedIn(exercise);
      expect(invented.length).toBeLessThanOrEqual(2);
      expect(exercise.effectiveBand).toBe('III');
    }
  });

  it('bends only the side the options are written in', () => {
    const exercise = chooseWith('5:III:foreign', vietnamesePool());
    for (const entry of inventedIn(exercise)) {
      // 'foreign' options for this role read the to-side, so the lookalike is
      // built from 'người' rather than from the Czech prompt.
      expect(entry.vi).not.toBe('người');
      expect(similarityBandForTerms(entry.vi, 'người')).toBe('III');
    }
  });

  it('invents for II when needed, but leaves band I to real vocabulary', () => {
    const bandTwo = chooseWith('5:II:foreign', vietnamesePool());
    expect(bandTwo.effectiveBand).toBe('II');
    expect(inventedIn(bandTwo).length).toBeGreaterThan(0);
    expect(inventedIn(chooseWith('5:I:foreign', vietnamesePool()))).toHaveLength(0);
  });

  it('never invents a spelling that is a word in the list', () => {
    // 'nuoc' is deliberately present as its own entry, so the accent-stripped
    // lookalike of 'nước' must not be offered as a wrong answer.
    const pool = vietnamesePool();
    pool[0] = word('a', 'voda', 'nước');
    pool.push(word('z', 'jine', 'nuoc'));
    const exercise = chooseWith('6:III:foreign', pool);
    expect(inventedIn(exercise).map((entry) => entry.vi)).not.toContain('nuoc');
  });

  it('carries no audio or accepted spellings over from the real word', () => {
    const pool = vietnamesePool();
    pool[0] = { ...pool[0], viAudio: 'https://example.test/a.mp3', acceptedTarget: ['nguoi'] };
    const exercise = chooseWith('5:III:foreign', pool);
    for (const entry of inventedIn(exercise)) {
      expect(entry.viAudio).toBeUndefined();
      expect(entry.acceptedTarget).toBeUndefined();
      expect(entry.vi).not.toBe('nguoi');
    }
  });

  it('skips matching rather than inventing entries that need two real sides', () => {
    const config = configWithStage(5, stage({ match: { variants: ['4:III'] } }));
    const round = pickMatchRound({
      anchor: vietnamesePool()[0],
      stageIndex: 5,
      config,
      pool: vietnamesePool(),
      seed: 7,
    });
    expect(round).toBeNull();
  });
});
