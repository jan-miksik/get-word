import { describe, expect, it } from 'vitest';
import {
  COMMENT_VERSION,
  MAX_COMMENT_TEXT_LENGTH,
  hashCommentText,
  makeManualComment,
  normalizeWordItemComment,
  pickWinningComment,
  type WordItemComment,
} from '@/lib/word-item-comment';

const manual = (over: Partial<WordItemComment> = {}): WordItemComment => ({
  version: 1,
  text: 'note',
  source: 'manual',
  ...over,
});

describe('normalizeWordItemComment', () => {
  it('accepts a well-formed generated comment with mentions', () => {
    const result = normalizeWordItemComment({
      version: 1,
      source: 'generated',
      text: '  pozor na false friend  ',
      mentions: [{ word: ' temps ', language: 'to', frequency: 3 }],
    });
    expect(result).toEqual({
      version: 1,
      text: 'pozor na false friend',
      source: 'generated',
      mentions: [{ word: 'temps', language: 'to', frequency: 3 }],
    });
  });

  it('drops a comment with a missing or unknown version', () => {
    expect(normalizeWordItemComment({ source: 'manual', text: 'x' })).toBeNull();
    expect(
      normalizeWordItemComment({ version: 2, source: 'manual', text: 'x' }),
    ).toBeNull();
  });

  it('drops a comment with an invalid source', () => {
    expect(
      normalizeWordItemComment({ version: 1, source: 'auto', text: 'x' }),
    ).toBeNull();
  });

  it('drops a comment whose text is empty after trim', () => {
    expect(
      normalizeWordItemComment({ version: 1, source: 'manual', text: '   ' }),
    ).toBeNull();
  });

  it('trims over-long MANUAL text instead of dropping it', () => {
    const long = 'a'.repeat(MAX_COMMENT_TEXT_LENGTH + 50);
    const result = normalizeWordItemComment({
      version: 1,
      source: 'manual',
      text: long,
    });
    expect(result?.text).toHaveLength(MAX_COMMENT_TEXT_LENGTH);
  });

  it('drops over-long GENERATED text entirely', () => {
    const long = 'a'.repeat(MAX_COMMENT_TEXT_LENGTH + 1);
    expect(
      normalizeWordItemComment({ version: 1, source: 'generated', text: long }),
    ).toBeNull();
  });

  it('keeps editedAt only for manual comments and normalizes it to ISO', () => {
    const manualResult = normalizeWordItemComment({
      version: 1,
      source: 'manual',
      text: 'x',
      editedAt: '2026-01-02T03:04:05.000Z',
    });
    expect(manualResult?.editedAt).toBe('2026-01-02T03:04:05.000Z');

    const generatedResult = normalizeWordItemComment({
      version: 1,
      source: 'generated',
      text: 'x',
      editedAt: '2026-01-02T03:04:05.000Z',
    });
    expect(generatedResult?.editedAt).toBeUndefined();
  });

  it('drops invalid editedAt without dropping the comment', () => {
    const result = normalizeWordItemComment({
      version: 1,
      source: 'manual',
      text: 'x',
      editedAt: 'not-a-date',
    });
    expect(result?.editedAt).toBeUndefined();
    expect(result?.text).toBe('x');
  });

  it('rejects mentions with bad frequency, language, or empty/over-long word', () => {
    const result = normalizeWordItemComment({
      version: 1,
      source: 'generated',
      text: 'x',
      mentions: [
        { word: 'ok', language: 'from', frequency: 2 },
        { word: 'badfreq', language: 'from', frequency: 4 },
        { word: 'badlang', language: 'sideways', frequency: 1 },
        { word: '   ', language: 'to', frequency: 1 },
        { word: 'z'.repeat(61), language: 'to', frequency: 1 },
      ],
    });
    expect(result?.mentions).toEqual([{ word: 'ok', language: 'from', frequency: 2 }]);
  });

  it('caps mentions at three', () => {
    const result = normalizeWordItemComment({
      version: 1,
      source: 'generated',
      text: 'x',
      mentions: Array.from({ length: 5 }, (_, i) => ({
        word: `w${i}`,
        language: 'to' as const,
        frequency: 1 as const,
      })),
    });
    expect(result?.mentions).toHaveLength(3);
  });

  it('omits mentions when none survive validation', () => {
    const result = normalizeWordItemComment({
      version: 1,
      source: 'generated',
      text: 'x',
      mentions: [{ word: '', language: 'to', frequency: 9 }],
    });
    expect(result?.mentions).toBeUndefined();
  });
});

describe('makeManualComment', () => {
  it('builds a versioned manual comment stamped with editedAt', () => {
    const before = Date.now();
    const result = makeManualComment('hello');
    expect(result?.version).toBe(COMMENT_VERSION);
    expect(result?.source).toBe('manual');
    expect(result?.text).toBe('hello');
    expect(new Date(result!.editedAt!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('returns null for empty text', () => {
    expect(makeManualComment('   ')).toBeNull();
  });
});

describe('pickWinningComment', () => {
  it('returns the present side when one is null', () => {
    const c = manual();
    expect(pickWinningComment(null, c)).toBe(c);
    expect(pickWinningComment(c, null)).toBe(c);
    expect(pickWinningComment(null, null)).toBeNull();
  });

  it('manual always beats generated regardless of order', () => {
    const m = manual({ text: 'mine' });
    const g = manual({ source: 'generated', text: 'gen' });
    expect(pickWinningComment(g, m)).toBe(m);
    expect(pickWinningComment(m, g)).toBe(m);
  });

  it('between two manual comments the newer editedAt wins', () => {
    const older = manual({ text: 'old', editedAt: '2026-01-01T00:00:00.000Z' });
    const newer = manual({ text: 'new', editedAt: '2026-02-01T00:00:00.000Z' });
    expect(pickWinningComment(older, newer)).toBe(newer);
    expect(pickWinningComment(newer, older)).toBe(newer);
  });

  it('between two generated comments the incoming one wins', () => {
    const existing = manual({ source: 'generated', text: 'a' });
    const incoming = manual({ source: 'generated', text: 'b' });
    expect(pickWinningComment(existing, incoming)).toBe(incoming);
  });
});

describe('hashCommentText', () => {
  it('is stable for the same text and differs when text changes', () => {
    expect(hashCommentText('abc')).toBe(hashCommentText('abc'));
    expect(hashCommentText('abc')).not.toBe(hashCommentText('abd'));
  });
});
