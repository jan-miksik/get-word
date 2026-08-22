import { describe, it, expect } from 'vitest';
import { STAGES } from '@/lib/words';
import {
  BALANCED_STAGE_CONFIGS,
  DEFAULT_FINE_TUNE_CONFIG,
  PRESET_IDS,
  activeMethods,
  detectPreset,
  methodShares,
  normalizeFineTuneConfig,
  presetConfig,
} from '../config';
import { METHOD_IDS } from '../types';

describe('preset table', () => {
  it('covers every spaced-repetition stage', () => {
    expect(BALANCED_STAGE_CONFIGS).toHaveLength(STAGES.length);
  });

  it('leaves every stage with something to render', () => {
    for (const preset of PRESET_IDS) {
      for (const stage of presetConfig(preset).stages) {
        expect(activeMethods(stage).length).toBeGreaterThan(0);
      }
    }
  });

  it('shares the 3-day stage across all enabled review methods', () => {
    const shares = methodShares(DEFAULT_FINE_TUNE_CONFIG.stages[3]);
    expect(shares.reveal).toBeCloseTo(0.4);
    expect(shares.typing).toBeCloseTo(0.2);
    expect(shares.choice).toBeCloseTo(0.2);
    expect(shares.assembly).toBeCloseTo(0.2);
  });

  it('shares the 7-day stage evenly across choice and typing', () => {
    expect(methodShares(DEFAULT_FINE_TUNE_CONFIG.stages[4])).toEqual({
      choice: 1 / 2,
      typing: 1 / 2,
    });
  });

  it('matches the requested default exercise ladder', () => {
    expect(DEFAULT_FINE_TUNE_CONFIG.stages).toEqual([
      {
        reveal: { weight: 2, variants: ['foreign'] },
        choice: { weight: 1, variants: [] },
        typing: { weight: 1, variants: [] },
        assembly: { weight: 1, variants: [] },
        match: { variants: [] },
      },
      {
        reveal: { weight: 2, variants: ['foreign'] },
        choice: { weight: 2, variants: ['2:I'] },
        typing: { weight: 1, variants: [] },
        assembly: { weight: 1, variants: ['letters:I', 'words:I'] },
        match: { variants: ['2:I', '3:I', '4:I'] },
      },
      {
        reveal: { weight: 2, variants: ['foreign'] },
        choice: { weight: 2, variants: ['2:II', '3:I', '4:I'] },
        typing: { weight: 1, variants: ['90:90'] },
        assembly: { weight: 1, variants: ['letters:II', 'words:II'] },
        match: { variants: ['2:II', '3:II', '4:II', '5:I', '6:I'] },
      },
      {
        reveal: { weight: 2, variants: ['known'] },
        choice: {
          weight: 1,
          variants: [
            '2:III',
            '3:II', '4:II', '5:I', '6:I', '7:I', '8:I',
            '3:III', '4:III', '5:II', '6:II', '7:II', '8:II',
          ],
        },
        typing: { weight: 1, variants: ['50:90'] },
        assembly: { weight: 1, variants: ['letters:III', 'words:III'] },
        match: { variants: ['2:III', '3:III', '4:III', '5:II', '6:II'] },
      },
      {
        reveal: { weight: 1, variants: [] },
        choice: { weight: 1, variants: ['5:III', '6:III', '7:III', '8:III'] },
        typing: { weight: 1, variants: ['20:50'] },
        assembly: { weight: 1, variants: [] },
        match: { variants: ['4:III', '5:III', '6:III'] },
      },
      {
        reveal: { weight: 1, variants: [] },
        choice: { weight: 1, variants: [] },
        typing: { weight: 2, variants: ['0:20'] },
        assembly: { weight: 1, variants: [] },
        match: { variants: ['5:III', '6:III'] },
      },
      {
        reveal: { weight: 1, variants: [] },
        choice: { weight: 1, variants: [] },
        typing: { weight: 4, variants: ['0:10'] },
        assembly: { weight: 1, variants: [] },
        match: { variants: ['6:III'] },
      },
      {
        reveal: { weight: 1, variants: [] },
        choice: { weight: 1, variants: [] },
        typing: { weight: 2, variants: ['0:0'] },
        assembly: { weight: 1, variants: [] },
        match: { variants: [] },
      },
    ]);
  });

  it('drops reveal once the intervals get long', () => {
    for (const stageIndex of [5, 6, 7]) {
      expect(activeMethods(DEFAULT_FINE_TUNE_CONFIG.stages[stageIndex])).not.toContain('reveal');
    }
  });

  it('leaves matching out of the review pool everywhere', () => {
    for (const stage of DEFAULT_FINE_TUNE_CONFIG.stages) {
      expect(METHOD_IDS).not.toContain('match');
      expect(stage.match).not.toHaveProperty('weight');
    }
  });
});

describe('detectPreset', () => {
  it('round-trips every preset', () => {
    for (const preset of PRESET_IDS) {
      expect(detectPreset(presetConfig(preset))).toBe(preset);
    }
  });

  it('reports custom once a stage is edited', () => {
    const config = presetConfig('balanced');
    config.stages[2] = {
      ...config.stages[2],
      typing: { weight: 2, variants: ['0:0'] },
    };
    expect(detectPreset(config)).toBe('custom');
  });
});

describe('normalizeFineTuneConfig', () => {
  it('falls back to the default for junk input', () => {
    expect(normalizeFineTuneConfig(null)).toEqual(DEFAULT_FINE_TUNE_CONFIG);
    expect(normalizeFineTuneConfig('nope')).toEqual(DEFAULT_FINE_TUNE_CONFIG);
    expect(normalizeFineTuneConfig({ stages: 'nope' })).toEqual(DEFAULT_FINE_TUNE_CONFIG);
  });

  it('drops variant codes it does not recognise', () => {
    const normalized = normalizeFineTuneConfig({
      version: 3,
      stages: [
        {
          reveal: { weight: 2, variants: ['foreign', 'sideways'] },
          choice: { weight: 1, variants: ['4:II', '9:II', '4:IV', 'nonsense'] },
          typing: { weight: 1, variants: ['0:0', 'telepathy'] },
          assembly: { weight: 1, variants: ['letters:exact', 'bad'] },
          match: { variants: ['6:III', '5:III', '7:III'] },
        },
      ],
    });

    expect(normalized.stages[0].reveal.variants).toEqual(['foreign']);
    expect(normalized.stages[0].choice.variants).toEqual(['4:II']);
    expect(normalized.stages[0].typing.variants).toEqual(['0:0']);
    expect(normalized.stages[0].assembly.variants).toEqual(['letters:I']);
    expect(normalized.stages[0].match.variants).toEqual(['6:III', '5:III']);
  });

  it('clamps weights into range', () => {
    const normalized = normalizeFineTuneConfig({
      version: 3,
      stages: [{ reveal: { weight: 9999, variants: ['foreign'] } }],
    });
    expect(normalized.stages[0].reveal.weight).toBe(4);
  });

  it('guarantees at least one active method per stage', () => {
    const normalized = normalizeFineTuneConfig({
      version: 3,
      stages: Array.from({ length: 8 }, () => ({
        reveal: { weight: 1, variants: [] },
        choice: { weight: 1, variants: [] },
        typing: { weight: 1, variants: [] },
        assembly: { weight: 1, variants: [] },
        match: { variants: [] },
      })),
    });
    for (const stage of normalized.stages) {
      expect(activeMethods(stage)).toEqual(['reveal']);
    }
  });

  it('pads a short stage list up to the full ladder', () => {
    const normalized = normalizeFineTuneConfig({ version: 3, stages: [] });
    expect(normalized.stages).toHaveLength(STAGES.length);
    expect(detectPreset(normalized)).toBe('balanced');
  });

  it('is idempotent', () => {
    const once = normalizeFineTuneConfig(DEFAULT_FINE_TUNE_CONFIG);
    expect(normalizeFineTuneConfig(once)).toEqual(once);
  });

  it('upgrades legacy typing methods while preserving the other customisations', () => {
    const normalized = normalizeFineTuneConfig({
      version: 1,
      stages: [{
        reveal: { weight: 4, variants: [] },
        choice: { weight: 2, variants: ['4:II'] },
        typing: { weight: 4, variants: ['bare'] },
        match: { variants: ['6:III'] },
      }],
    });
    expect(normalized.version).toBe(3);
    expect(normalized.stages[0].choice).toEqual({ weight: 2, variants: ['4:II'] });
    expect(normalized.stages[0].typing).toEqual(DEFAULT_FINE_TUNE_CONFIG.stages[0].typing);
  });
});
