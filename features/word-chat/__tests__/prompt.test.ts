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
      addressRegister: 'casual',
      salutationGender: 'neutral',
      languageLevel: 'A0',
      brief: null,
    });

    expect(prompt).toContain('One or two concise sentences');
    expect(prompt).toContain('Never praise the learner or their answer');
    expect(prompt).toContain('Do not add a validation phrase before it');
    expect(prompt).toContain('Friendly is fine; eager is not');
    expect(prompt).toContain("Make them concrete continuations of the learner's latest situation");
    expect(prompt).toContain('never use generic domain chips');
  });

  it('pins formal chat address when the learner chooses it', () => {
    const prompt = buildChatSystemPrompt({
      languageFrom: 'cs',
      languageTo: 'vi',
      chatLanguage: 'cs',
      addressRegister: 'formal',
      salutationGender: 'female',
      languageLevel: 'B1',
      brief: null,
    });

    expect(prompt).toContain('polite/formal second-person forms');
    expect(prompt).toContain('use feminine forms');
  });

  it('asks for three sentences and seven supporting words', () => {
    const { system } = buildProposalPrompt({
      languageFrom: 'cs',
      languageTo: 'vi',
      chatLanguage: 'cs',
      languageLevel: 'A0',
      messages: [{ role: 'user', content: 'Kavárna' }],
      brief: null,
      exclusions: [],
    });

    expect(TARGET_SENTENCE_COUNT).toBe(3);
    expect(TARGET_WORD_COUNT).toBe(7);
    expect(system).toContain('about 3 sentences and 7 single words or short phrases');
  });

  it('never ships a reuse corpus to the model', () => {
    // Reuse is recovered by matching the reply against every existing item in
    // the pair, which searches far more rows than a prompt could hold. Putting
    // a pool back in the prompt would pay for both.
    const { system, user } = buildProposalPrompt({
      languageFrom: 'cs',
      languageTo: 'vi',
      chatLanguage: 'cs',
      languageLevel: 'A2',
      messages: [{ role: 'user', content: 'Kavárna' }],
      brief: null,
      exclusions: ['dobrý den'],
    });

    expect(system).not.toContain('corpusItemId');
    expect(user).not.toContain('corpus');
    // Exclusions still travel: without them the model re-proposes what the
    // learner already studies and the server drops most of the batch.
    expect(user).toContain('dobrý den');
  });

  it('runs every call on one model by default', () => {
    // Sonnet 5 everywhere for now, by decision: split the routing only when the
    // logged spend or the output quality justifies it.
    expect(WORD_CHAT_CHAT_MODEL).toBe('anthropic/claude-sonnet-5');
    expect(WORD_CHAT_PROPOSAL_MODEL).toBe('anthropic/claude-sonnet-5');
    expect(WORD_CHAT_TRANSLATION_MODEL).toBe('anthropic/claude-sonnet-5');
  });
});
