import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ db: {} }));

import {
  CHAT_REASONING,
  PROPOSAL_MAX_TOKENS,
  PROPOSAL_REASONING,
  WORD_CHAT_CHAT_MODEL,
  WORD_CHAT_PROPOSAL_MODEL,
  WORD_CHAT_PROVIDER_PREFERENCES,
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
    expect(prompt).toContain('"contentMode"');
    expect(prompt).toContain('types of fish on restaurant menus');
    expect(prompt).toContain('only for an explicit language-setting request');
  });

  it('allows one follow-up question and pushes the model to infer the rest', () => {
    const prompt = buildChatSystemPrompt({
      languageFrom: 'cs',
      languageTo: 'vi',
      chatLanguage: 'cs',
      addressRegister: 'casual',
      salutationGender: 'neutral',
      languageLevel: 'B1',
      brief: null,
    });

    expect(prompt).toContain('Ask AT MOST ONE short follow-up question');
    expect(prompt).toContain('Never ask a second one');
    expect(prompt).toContain('Prefer inferring over asking');
    expect(prompt).toContain('set "readyToPropose" to true on that very first turn');
    expect(prompt).not.toContain('at most TWO short follow-up questions');
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
      contentMode: 'situation',
      messages: [{ role: 'user', content: 'Kavárna' }],
      brief: null,
      exclusions: [],
    });
    const b1 = buildProposalPrompt({
      languageFrom: 'cs',
      languageTo: 'en',
      chatLanguage: 'cs',
      languageLevel: 'B1',
      contentMode: 'situation',
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
    expect(a0.system).toContain('for A0-A2 above the ceiling, for B1/B2/C1 below the floor');
    expect(a0.system).toContain('unless the profile itself grants an exception');
    expect(b1.system).toContain('Do not raise difficulty merely by making a basic sentence longer');
  });

  it('uses content-mode roles to preserve category inventories without weakening sentences', () => {
    const { system } = buildProposalPrompt({
      languageFrom: 'cs',
      languageTo: 'en',
      chatLanguage: 'cs',
      languageLevel: 'B2',
      contentMode: 'mixed',
      messages: [{ role: 'user', content: 'Druhy ryb a jak si je objednat' }],
      brief: null,
      exclusions: [],
    });

    expect(system).toContain('exactly 4 with role "category_member"');
    expect(system).toContain('exactly 3 with role "situational_expression"');
    expect(system).toContain('B1-C1 frequency floor, novelty test, and ban on bare topic labels');
    expect(system).toContain('Sentences and "situational_expression" items remain fully subject');
    expect(system).toContain('rare, technical, regional, or taxonomically obscure');
  });

  it('does not treat category members as beginner padding in higher-level checks', () => {
    const categoryBatch = [
      { kind: 'sentence', role: 'sentence', text: 'Losos má výraznější chuť než treska.' },
      { kind: 'sentence', role: 'sentence', text: 'Makrela patří mezi tučnější ryby.' },
      { kind: 'sentence', role: 'sentence', text: 'Pstruh se často připravuje celý.' },
      ...['losos', 'treska', 'makrela', 'pstruh', 'tuňák', 'sardinka', 'kapr'].map((text) => ({
        kind: 'word',
        role: 'category_member',
        text,
      })),
    ];

    expect(
      proposalDifficultyIssue({ level: 'B2', languageFrom: 'cs', items: categoryBatch }),
    ).toBeNull();
  });

  it('gives the top levels a novelty test, not just a frequency floor', () => {
    // The complaint this answers: at the highest level the proposals were
    // still words the learner plainly already knew. Useful is not enough — an
    // item has to be new, and the prompt has to say so per level.
    const b2 = buildProposalPrompt({
      languageFrom: 'cs',
      languageTo: 'en',
      chatLanguage: 'cs',
      languageLevel: 'B2',
      contentMode: 'situation',
      messages: [{ role: 'user', content: 'Jednání s dodavateli' }],
      brief: null,
      exclusions: [],
    });
    const c1 = buildProposalPrompt({
      languageFrom: 'cs',
      languageTo: 'en',
      chatLanguage: 'cs',
      languageLevel: 'C1',
      contentMode: 'situation',
      messages: [{ role: 'user', content: 'Jednání s dodavateli' }],
      brief: null,
      exclusions: [],
    });

    expect(b2.system).toContain('B2 profile');
    expect(b2.system).toContain('Novelty test');
    expect(b2.system).toContain('Usefulness alone is not enough');
    expect(c1.system).toContain('C1 profile');
    expect(c1.system).toContain('outside the ~8000 most frequent words');
    expect(c1.system).toContain('ask whether a confident B2 speaker would already say it');
    expect(c1.system).toContain('C1 calibration examples');
    expect(c1.system).toContain('Learner level: C1');
    // The floor is a floor for every higher level, so the audit has to name it.
    expect(c1.system).toContain('for B1/B2/C1 below the floor');
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
      contentMode: 'situation',
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

  it('uses Sonnet for chat, proposal selection, and translation by default', () => {
    expect(WORD_CHAT_CHAT_MODEL).toBe('anthropic/claude-sonnet-5');
    expect(WORD_CHAT_PROPOSAL_MODEL).toBe('anthropic/claude-sonnet-5');
    expect(WORD_CHAT_TRANSLATION_MODEL).toBe('anthropic/claude-sonnet-5');
  });

  it('keeps hidden reasoning off the proposal critical path', () => {
    expect(PROPOSAL_MAX_TOKENS).toBe(2_500);
    expect(PROPOSAL_REASONING).toEqual({ enabled: false, exclude: true });
    expect(WORD_CHAT_PROVIDER_PREFERENCES).toMatchObject({
      zdr: true,
      data_collection: 'deny',
      sort: 'throughput',
    });
  });

  it('takes the chat turn off reasoning entirely', () => {
    // The learner watches this reply stream in, and nothing visible can appear
    // until the thinking block ends. The turn asks one question or says it is
    // ready — there is nothing here to deliberate about.
    expect(CHAT_REASONING).toEqual({ enabled: false, exclude: true });
  });
});
