import { describe, expect, it, vi } from 'vitest';

// config pulls in the rate-limit bucket, which pulls in the db client.
vi.mock('@/lib/db/client', () => ({ db: {} }));

import { SELECTABLE_MODELS, resolveSelectedModel } from '../server/config';

describe('resolveSelectedModel', () => {
  it('accepts a model from the priced allowlist', () => {
    const allowed = SELECTABLE_MODELS[0].id;
    expect(resolveSelectedModel(allowed, 'anthropic/claude-sonnet-5')).toBe(allowed);
  });

  it('falls back to the configured model for anything unknown', () => {
    // The allowlist is what stops a request body from routing the donated
    // server key to an arbitrary — possibly expensive — model.
    for (const requested of [
      'openai/o5-pro',
      '',
      '   ',
      null,
      undefined,
      42,
      { id: 'anthropic/claude-opus-5' },
    ]) {
      expect(resolveSelectedModel(requested, 'anthropic/claude-sonnet-5')).toBe(
        'anthropic/claude-sonnet-5',
      );
    }
  });

  it('prices every selectable model, so spend is always reportable', () => {
    expect(SELECTABLE_MODELS.length).toBeGreaterThan(0);
    for (const model of SELECTABLE_MODELS) {
      expect(model.inputPricePerMillion).toBeGreaterThan(0);
      expect(model.outputPricePerMillion).toBeGreaterThan(0);
    }
  });
});
