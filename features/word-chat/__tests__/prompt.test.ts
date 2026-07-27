import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ db: {} }));

import {
  TARGET_SENTENCE_COUNT,
  TARGET_WORD_COUNT,
  WORD_CHAT_CHAT_MODEL,
  WORD_CHAT_PROPOSAL_MODEL,
  WORD_CHAT_TRANSLATION_MODEL,
} from '../server/config';
import { buildChatSystemPrompt, buildProposalPrompt } from '../server/prompt';

describe('buildChatSystemPrompt', () => {
  it('keeps chat replies concise and matter-of-fact', () => {
    const prompt = buildChatSystemPrompt({
      languageFrom: 'cs',
      languageTo: 'vi',
      chatLanguage: 'cs',
      brief: null,
    });

    expect(prompt).toContain('One or two concise sentences');
    expect(prompt).toContain('Never praise the learner or their answer');
    expect(prompt).toContain('Do not add a validation phrase before it');
    expect(prompt).toContain('Friendly is fine; eager is not');
  });

  it('asks for three sentences and seven supporting words', () => {
    const { system } = buildProposalPrompt({
      languageFrom: 'cs',
      languageTo: 'vi',
      chatLanguage: 'cs',
      messages: [{ role: 'user', content: 'Kavárna' }],
      brief: null,
      corpusPool: [],
      exclusions: [],
    });

    expect(TARGET_SENTENCE_COUNT).toBe(3);
    expect(TARGET_WORD_COUNT).toBe(7);
    expect(system).toContain('about 3 sentences and 7 single words or short phrases');
  });

  it('runs every call on one model by default', () => {
    // Sonnet 5 everywhere for now, by decision: split the routing only when the
    // logged spend or the output quality justifies it.
    expect(WORD_CHAT_CHAT_MODEL).toBe('anthropic/claude-sonnet-5');
    expect(WORD_CHAT_PROPOSAL_MODEL).toBe('anthropic/claude-sonnet-5');
    expect(WORD_CHAT_TRANSLATION_MODEL).toBe('anthropic/claude-sonnet-5');
  });
});
