import { describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({
  TARGET_ITEM_COUNT: 10,
}));

import { buildProposalPrompt } from '../prompt';

describe('word-chat proposal prompt', () => {
  it('turns B1 into explicit medium-difficulty guidance instead of beginner basics', () => {
    const { system } = buildProposalPrompt({
      languageFrom: 'cs',
      languageTo: 'en',
      chatLanguage: 'cs',
      languageLevel: 'B1',
      messages: [{ role: 'user', content: 'Letiště a doprava' }],
      brief: null,
      exclusions: [],
    });

    expect(system).toContain('B1 profile');
    expect(system).toContain('Word-item frequency band (FLOOR)');
    expect(system).toContain('ALREADY KNOWS basic labels');
    expect(system).toContain('EXACTLY 3 sentences and EXACTLY 7 words or short phrases');
    expect(system).toContain('CEFR functions to teach: explaining a problem');
    expect(system).toContain('Single words are fine when genuinely B1-useful');
  });
});
