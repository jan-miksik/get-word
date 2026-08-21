import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ db: {} }));

vi.mock('../config', () => ({
  OPENROUTER_API_URL: 'https://example.invalid',
  OPENROUTER_MAX_ATTEMPTS: 1,
  OPENROUTER_RETRY_BASE_DELAY_MS: 1,
  OPENROUTER_TIMEOUT_MS: 1000,
  MAX_WORD_CHAT_ITEM_CHARS: 120,
  PROPOSAL_REASONING: {},
  WORD_CHAT_PROPOSAL_MODEL: 'test-model',
  WORD_CHAT_PROVIDER_PREFERENCES: {},
  getServerApiKey: () => 'test-key',
}));

import {
  buildSimilarWordsPrompt,
  materializeSimilarWords,
  isSeedInDisguise,
  parseSimilarWords,
  writtenSimilarity,
} from '../similar';

describe('similar-words prompt', () => {
  const prompt = buildSimilarWordsPrompt({
    languageFrom: 'cs',
    languageTo: 'vi',
    chatLanguage: 'cs',
    seed: { known: 'sto', target: 'một trăm' },
    count: 3,
  });

  it('asks about the studied expression itself, on the target side', () => {
    expect(prompt.user).toContain('một trăm');
    expect(prompt.user).toContain('sto');
    expect(prompt.user).toContain('written most like');
  });

  it('asks for spelling similarity and rules meaning out', () => {
    expect(prompt.system).toContain('Similarity here means SPELLING, and nothing else');
    expect(prompt.system).toContain('never on meaning');
    expect(prompt.system).toContain('Near twins');
    expect(prompt.system).toContain('Half-alike');
  });

  it('caps the answer at the requested handful and forbids padding', () => {
    expect(prompt.system).toContain('AT MOST 3 candidates');
    expect(prompt.system).toContain('rather than padding');
  });
});

describe('parseSimilarWords', () => {
  it('reads both sides of every pair', () => {
    expect(parseSimilarWords('{"items":[{"target":"một nghìn","known":"tisíc"}]}')).toEqual([
      { target: 'một nghìn', known: 'tisíc' },
    ]);
  });

  it('rejects a reply with no items array', () => {
    expect(() => parseSimilarWords('{"reply":"here you go"}')).toThrow();
  });
});

describe('writtenSimilarity', () => {
  it('scores a tone-mark-only difference as an all-but-identical twin', () => {
    expect(writtenSimilarity('một trạm', 'một trăm')).toBe(1);
  });

  it('scores a half-shared spelling in the middle of the range', () => {
    const ratio = writtenSimilarity('mặt trăng', 'một trăm');
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(0.9);
  });

  it('scores a same-topic word with a different spelling below the floor', () => {
    expect(writtenSimilarity('một nghìn', 'một trăm')).toBeLessThan(0.5);
  });
});

describe('isSeedInDisguise', () => {
  it('rejects the seed with a diacritic dropped, which is a misspelling', () => {
    expect(isSeedInDisguise('cảm on', 'cảm ơn')).toBe(true);
  });

  it('accepts a changed diacritic, which is the closest real twin there is', () => {
    expect(isSeedInDisguise('một trạm', 'một trăm')).toBe(false);
    expect(isSeedInDisguise('nhà gà', 'nhà ga')).toBe(false);
  });

  it('rejects a piece of the seed and the seed with a word bolted on', () => {
    expect(isSeedInDisguise('nhà', 'nhà ga')).toBe(true);
    expect(isSeedInDisguise('cảm ơn nhiều', 'cảm ơn')).toBe(true);
  });

  it('accepts a phrase that merely shares a word with the seed', () => {
    expect(isSeedInDisguise('hai trăm', 'một trăm')).toBe(false);
    expect(isSeedInDisguise('nhà ăn', 'nhà ga')).toBe(false);
  });
});

describe('materializeSimilarWords', () => {
  const base = {
    seed: { known: 'sto', target: 'một trăm' },
    languageFrom: 'cs',
    languageTo: 'vi',
    exclusionKeys: new Set<string>(),
    limit: 3,
  };

  it('keeps the lookalikes and drops the words that are only related in meaning', () => {
    const items = materializeSimilarWords({
      ...base,
      raw: [
        { known: 'tisíc', target: 'một nghìn' },
        { known: 'stanice', target: 'một trạm' },
        { known: 'měsíc', target: 'mặt trăng' },
      ],
    });
    expect(items.map((item) => item.target)).toEqual(['một trạm', 'mặt trăng']);
  });

  it('leads with the closest lookalike whatever order the model used', () => {
    const items = materializeSimilarWords({
      ...base,
      raw: [
        { known: 'stránka', target: 'một trang' },
        { known: 'stanice', target: 'một trạm' },
      ],
    });
    expect(items[0].target).toBe('một trạm');
  });

  it('drops the seed echoed back, cut down, or with its marks dropped', () => {
    const items = materializeSimilarWords({
      ...base,
      raw: [
        { known: 'Sto', target: 'một trăm' },
        { known: 'sto', target: 'trăm' },
        { known: 'sto', target: 'mot tram' },
        { known: 'stanice', target: 'một trạm' },
      ],
    });
    expect(items).toEqual([{ known: 'stanice', target: 'một trạm' }]);
  });

  it('drops duplicates, empties, and words the learner already studies', () => {
    const items = materializeSimilarWords({
      ...base,
      exclusionKeys: new Set(['jehlice']),
      raw: [
        { known: 'stanice', target: 'một trạm' },
        { known: 'stanoviště', target: 'một trạm' },
        { known: 'jehlice', target: 'một trâm' },
        { known: '', target: 'một trám' },
      ],
    });
    expect(items).toEqual([{ known: 'stanice', target: 'một trạm' }]);
  });

  it('never returns more than the limit', () => {
    const items = materializeSimilarWords({
      ...base,
      limit: 2,
      raw: [
        { known: 'stanice', target: 'một trạm' },
        { known: 'jehlice', target: 'một trâm' },
        { known: 'trám', target: 'một trám' },
      ],
    });
    expect(items).toHaveLength(2);
  });

  it('keeps word items free of the sentence polish', () => {
    const items = materializeSimilarWords({
      ...base,
      raw: [{ known: '  jedna   stanice ', target: 'một trạm' }],
    });
    expect(items).toEqual([{ known: 'jedna stanice', target: 'một trạm' }]);
  });
});
