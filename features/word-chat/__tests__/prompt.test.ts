import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ db: {} }));

import {
  PROPOSAL_MAX_TOKENS,
  PROPOSAL_REASONING,
  WORD_CHAT_CHAT_MODEL,
  WORD_CHAT_PROPOSAL_MODEL,
  WORD_CHAT_PROPOSAL_PROVIDER_PREFERENCES,
  WORD_CHAT_TRANSLATION_MODEL,
} from '../server/config';
import {
  proposalDifficultyIssue,
  proposalDifficultyProfile,
} from '../difficulty';
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
    expect(prompt).toContain('You can also change the study pair');
    expect(prompt).toContain('"languageChange": null');
    expect(prompt).toContain('only for an explicit language-setting request');
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

  it('keeps the proposal composition fixed and changes difficulty guidance by level', () => {
    const a0 = buildProposalPrompt({
      languageFrom: 'cs',
      languageTo: 'vi',
      chatLanguage: 'cs',
      languageLevel: 'A0',
      messages: [{ role: 'user', content: 'Kavárna' }],
      brief: null,
      exclusions: [],
    });
    const b1 = buildProposalPrompt({
      languageFrom: 'cs',
      languageTo: 'en',
      chatLanguage: 'cs',
      languageLevel: 'B1',
      messages: [{ role: 'user', content: 'Letiště a doprava' }],
      brief: null,
      exclusions: [],
    });

    expect(proposalDifficultyProfile('A0')).toMatchObject({
      sentenceCount: 3,
      supportCount: 7,
    });
    expect(proposalDifficultyProfile('B1')).toMatchObject({
      sentenceCount: 3,
      supportCount: 7,
    });
    expect(a0.system).toContain('EXACTLY 3 sentences and EXACTLY 7 words or short phrases');
    expect(b1.system).toContain('EXACTLY 3 sentences and EXACTLY 7 words or short phrases');
    expect(a0.system).toContain('Word-item frequency band (CEILING)');
    expect(b1.system).toContain('B1 profile');
    expect(b1.system).toContain('Word-item frequency band (FLOOR)');
    expect(b1.system).toContain('Assume the learner ALREADY KNOWS basic labels');
    expect(b1.system).toContain('CEFR functions to teach: explaining a problem');
    expect(b1.system).toContain('Single words are fine when genuinely B1-useful');
    expect(b1.system).toContain('Wherever they conflict with the B1 profile below');
    expect(a0.system).toContain('for A0-A2 above the ceiling, for B1/B2 below the floor');
    expect(a0.system).toContain('unless the profile itself grants an exception');
    expect(b1.system).toContain('Do not raise difficulty merely by making a basic sentence longer');
  });

  it('rejects a starter-like B1 batch but accepts the fixed 3/7 shape', () => {
    const starterBatch = [
      { kind: 'sentence', text: 'Můj let má zpoždění.' },
      { kind: 'sentence', text: 'Dal bych si kávu s mlékem, prosím.' },
      { kind: 'sentence', text: 'Můžete mi pomoci s kufrem?' },
      ...['let', 'zpoždění', 'káva', 'mléko', 'prosím', 'pomoc', 'kufr'].map((text) => ({
        kind: 'word',
        text,
      })),
    ];
    const b1Batch = [
      ...Array.from({ length: 3 }, (_, index) => ({
        kind: 'sentence',
        text: `Potřebuji vyřešit komplikaci číslo ${index}, protože navazující spoj odlétá brzy.`,
      })),
      { kind: 'word', text: 'navazující spoj' },
      { kind: 'word', text: 'podat žádost' },
      { kind: 'word', text: 'náhradní řešení' },
      { kind: 'word', text: 'čekací listina' },
      { kind: 'word', text: 'komplikace' },
      { kind: 'word', text: 'nárok' },
      { kind: 'word', text: 'přesměrovat' },
    ];

    expect(
      proposalDifficultyIssue({
        level: 'B1',
        languageFrom: 'cs',
        items: starterBatch,
      }),
    ).toContain('beginner-style vocabulary labels');
    expect(
      proposalDifficultyIssue({
        level: 'B1',
        languageFrom: 'cs',
        items: b1Batch,
      }),
    ).toBeNull();
  });

  it('keeps a compact but genuinely B1 Czech batch', () => {
    // Token count is a poor proxy for complexity in a synthetic language: these
    // sentences carry real B1 functions (reported information, a condition, a
    // specific complaint) in six to eight words, and several of the word items
    // are legitimately single words. An earlier threshold rejected exactly this
    // shape, which cost a paid retry and could end in an error screen.
    const compactB1Batch = [
      { kind: 'sentence', text: 'Zdá se, že položka byla účtována dvakrát.' },
      { kind: 'sentence', text: 'Kdyby to nešlo, ozvěte se mi.' },
      { kind: 'sentence', text: 'Účtenku bohužel nemám u sebe.' },
      ...['reklamovat', 'vrácení peněz', 'nesrovnalost', 'dodatečně', 'vyřídit', 'nárok', 'proplatit'].map(
        (text) => ({ kind: 'word', text }),
      ),
    ];

    expect(
      proposalDifficultyIssue({
        level: 'B1',
        languageFrom: 'cs',
        items: compactB1Batch,
      }),
    ).toBeNull();
  });

  it('does not treat a short batch as a difficulty problem', () => {
    // Item count is a shape issue that `materializeProposedItems` already
    // clamps. Failing here would burn a paid retry on something that is not
    // about difficulty at all.
    const shortButHardBatch = [
      { kind: 'sentence', text: 'Rád bych to reklamoval, protože to neodpovídá popisu.' },
      { kind: 'sentence', text: 'Pokud to nepůjde, budu potřebovat písemné potvrzení.' },
      { kind: 'sentence', text: 'Zdá se, že se termín posunul bez upozornění.' },
      { kind: 'word', text: 'písemné potvrzení' },
      { kind: 'word', text: 'odstoupit od smlouvy' },
    ];

    expect(
      proposalDifficultyIssue({
        level: 'B2',
        languageFrom: 'cs',
        items: shortButHardBatch,
      }),
    ).toBeNull();
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

  it('keeps the non-streamed proposal on a low-latency reasoning budget', () => {
    expect(PROPOSAL_MAX_TOKENS).toBe(4_000);
    expect(PROPOSAL_REASONING).toEqual({ effort: 'low', exclude: true });
    expect(WORD_CHAT_PROPOSAL_PROVIDER_PREFERENCES).toMatchObject({
      zdr: true,
      data_collection: 'deny',
      sort: 'throughput',
    });
  });
});
