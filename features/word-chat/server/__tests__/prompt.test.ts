import { describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({
  TARGET_ITEM_COUNT: 10,
}));

import { buildBriefPrompt, buildProposalPrompt } from '../prompt';

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

  it('keeps next-session chip labels in the chat language when regenerating the brief', () => {
    const { system } = buildBriefPrompt({
      previousBrief: {
        version: 1,
        goals: ['talk to customers'],
        situations: [],
        coveredTopics: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      messages: [{ role: 'user', content: 'Potřebuju zákazníky v salonu.' }],
      committedTopic: 'Salon',
      chatLanguage: 'cs',
    });

    expect(system).toContain('Write every visible topical label in čeština');
    expect(system).toContain('Translate or rewrite older profile entries into čeština');
  });
});
