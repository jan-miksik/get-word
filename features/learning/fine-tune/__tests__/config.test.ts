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

  it('gives the 7-day stage the same weights as the 3-day one', () => {
    expect(methodShares(DEFAULT_FINE_TUNE_CONFIG.stages[4])).toEqual(
      methodShares(DEFAULT_FINE_TUNE_CONFIG.stages[3]),
    );
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
          match: { variants: ['6:III', '5:III'] },
        },
      ],
    });

    expect(normalized.stages[0].reveal.variants).toEqual(['foreign']);
    expect(normalized.stages[0].choice.variants).toEqual(['4:II']);
    expect(normalized.stages[0].typing.variants).toEqual(['0:0']);
    expect(normalized.stages[0].assembly.variants).toEqual(['letters:exact']);
    expect(normalized.stages[0].match.variants).toEqual(['6:III']);
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
