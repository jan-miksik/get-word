import { describe, expect, it, vi } from 'vitest';
import {
  buildCommentPrompt,
  generateComments,
  parseCommentItems,
  toGeneratedComment,
  type CommentSourceItem,
} from '@/lib/comment-generation';

const items: CommentSourceItem[] = [
  { sourceIndex: 0, known: 'čas', target: 'temps' },
  { sourceIndex: 1, known: 'počasí', target: 'temps' },
];

describe('buildCommentPrompt', () => {
  it('injects the language pair and requests mention.language', () => {
    const prompt = buildCommentPrompt({ languageFrom: 'cs', languageTo: 'fr', items });
    expect(prompt).toContain('cs -> fr');
    expect(prompt).toContain('"language": "from"');
    expect(prompt).toContain('Do not restate the source word or its direct translation from the card');
    expect(prompt).toContain('Avoid warning labels and filler phrases');
    // the source pairs are embedded for the model
    expect(prompt).toContain('temps');
  });
});

describe('parseCommentItems', () => {
  const expected = new Set([0, 1]);

  it('parses well-formed rows and validates the comment', () => {
    const result = parseCommentItems(
      {
        items: [
          {
            sourceIndex: 0,
            comment: {
              text: 'false friend',
              mentions: [{ word: 'temps', language: 'to', frequency: 3 }],
            },
          },
        ],
      },
      expected,
    );
    expect(result).toEqual([
      {
        sourceIndex: 0,
        text: 'false friend',
        mentions: [{ word: 'temps', language: 'to', frequency: 3 }],
      },
    ]);
  });

  it('skips rows whose sourceIndex is out of the expected batch', () => {
    const result = parseCommentItems(
      { items: [{ sourceIndex: 9, comment: { text: 'x' } }] },
      expected,
    );
    expect(result).toEqual([]);
  });

  it('skips rows with no comment (sparse output is normal)', () => {
    const result = parseCommentItems(
      { items: [{ sourceIndex: 0 }, { sourceIndex: 1, comment: null }] },
      expected,
    );
    expect(result).toEqual([]);
  });

  it('drops malformed / invalid comments instead of throwing', () => {
    const result = parseCommentItems(
      {
        items: [
          { sourceIndex: 0, comment: { text: '   ' } }, // empty after trim
          { sourceIndex: 1, comment: { text: 'a'.repeat(500) } }, // over-long generated → dropped
        ],
      },
      expected,
    );
    expect(result).toEqual([]);
  });

  it('returns [] for non-object / missing items input', () => {
    expect(parseCommentItems(null, expected)).toEqual([]);
    expect(parseCommentItems({ nope: true }, expected)).toEqual([]);
  });

  it('does not double-process a repeated sourceIndex', () => {
    const result = parseCommentItems(
      {
        items: [
          { sourceIndex: 0, comment: { text: 'first' } },
          { sourceIndex: 0, comment: { text: 'second' } },
        ],
      },
      expected,
    );
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('first');
  });
});

describe('generateComments', () => {
  it('calls the model and returns parsed comments', async () => {
    const call = vi.fn().mockResolvedValue(
      JSON.stringify({ items: [{ sourceIndex: 0, comment: { text: 'note' } }] }),
    );
    const result = await generateComments(
      { languageFrom: 'cs', languageTo: 'fr', items },
      { call },
    );
    expect(call).toHaveBeenCalledOnce();
    expect(result).toEqual([{ sourceIndex: 0, text: 'note', mentions: undefined }]);
  });

  it('is best-effort: a thrown batch is skipped, never aborting the run', async () => {
    const call = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await generateComments(
      { languageFrom: 'cs', languageTo: 'fr', items },
      { call },
    );
    expect(result).toEqual([]);
  });
});

describe('toGeneratedComment', () => {
  it('wraps a generated row as a versioned generated comment', () => {
    expect(toGeneratedComment({ sourceIndex: 0, text: 'note' })).toEqual({
      version: 1,
      text: 'note',
      source: 'generated',
    });
  });

  it('returns null when the wrapped text is invalid', () => {
    expect(toGeneratedComment({ sourceIndex: 0, text: '   ' })).toBeNull();
  });
});
