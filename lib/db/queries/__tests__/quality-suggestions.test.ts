import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();

vi.mock('../../client', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

import {
  getListQualitySuggestions,
  dismissQualitySuggestion,
  writeQualityVerdict,
} from '../quality-pool';

function sqlText(query: unknown): string {
  return rawSqlText(query).replace(/\s+/g, ' ').trim();
}

function rawSqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return '';
  return chunks
    .map((chunk) => {
      if (typeof chunk === 'string') return chunk;
      // Bound params can be null (a verdict with no suggestion), and those
      // arrive as null chunks rather than objects.
      if (chunk === null || chunk === undefined) return '';
      const value = (chunk as { value?: unknown }).value;
      if (Array.isArray(value)) return value.join('');
      if (typeof value === 'string') return value;
      return rawSqlText(chunk);
    })
    .join('');
}

beforeEach(() => {
  mockExecute.mockReset().mockResolvedValue([]);
});

describe('learner-facing suggestions', () => {
  /**
   * One switch, one meaning: turning quality review off has to stop the
   * suggestions it produced, not just stop new ones being made.
   */
  it('requires the consent to still be live on both halves', async () => {
    await getListQualitySuggestions('list-1', 'user-1');
    const query = sqlText(mockExecute.mock.calls[0]?.[0]);

    expect(query).toContain('l.review_opt_in = true');
    expect(query).toContain('u.review_opt_in = true');
  });

  it('only ever returns the requesting owner’s own list', async () => {
    await getListQualitySuggestions('list-1', 'user-1');
    const query = sqlText(mockExecute.mock.calls[0]?.[0]);

    expect(query).toContain('i.list_id =');
    expect(query).toContain('l.owner_id =');
  });

  it('hides a suggestion the learner already declined at this version', async () => {
    await getListQualitySuggestions('list-1', 'user-1');
    const query = sqlText(mockExecute.mock.calls[0]?.[0]);

    expect(query).toContain('content_quality_dismissals');
    expect(query).toContain('d.suggestion_version >= r.suggestion_version');
  });

  it('ignores a verdict that carries no actual suggestion', async () => {
    await getListQualitySuggestions('list-1', 'user-1');
    const query = sqlText(mockExecute.mock.calls[0]?.[0]);

    expect(query).toContain("r.verdict = 'suggested'");
    expect(query).toContain('r.suggested_known IS NOT NULL OR r.suggested_target IS NOT NULL');
  });

  it('records a dismissal against a specific version', async () => {
    await dismissQualitySuggestion('user-1', 'p1:abc', 3);
    const query = sqlText(mockExecute.mock.calls[0]?.[0]);

    expect(query).toContain('INSERT INTO content_quality_dismissals');
    expect(query).toContain('ON CONFLICT DO NOTHING');
  });
});

describe('verdict writes', () => {
  /**
   * The point of versioning the suggestion: re-saving identical wording must
   * not resurface it for someone who already said no, while a genuine
   * improvement must.
   */
  it('bumps the suggestion version only when the wording changes', async () => {
    mockExecute.mockResolvedValue([{ suggestion_version: 2 }]);
    await writeQualityVerdict({
      poolKey: 'p1:abc',
      languageFrom: 'cs',
      languageTo: 'en',
      textKnown: 'pes',
      textTarget: 'dog',
      verdict: 'suggested',
      suggestedKnown: null,
      suggestedTarget: 'a dog',
      suggestionNote: null,
      reviewedBy: 'editor-1',
      heuristicVersion: 1,
      llmAuditVersion: null,
    });
    const query = sqlText(mockExecute.mock.calls[0]?.[0]);

    expect(query).toContain('suggested_known IS DISTINCT FROM EXCLUDED.suggested_known');
    expect(query).toContain('suggested_target IS DISTINCT FROM EXCLUDED.suggested_target');
    expect(query).toContain('suggestion_version + 1');
  });

  /** A verdict must never silently overwrite what the scan or audit computed. */
  it('does not touch the heuristic or audit columns', async () => {
    mockExecute.mockResolvedValue([{ suggestion_version: 0 }]);
    await writeQualityVerdict({
      poolKey: 'p1:abc',
      languageFrom: 'cs',
      languageTo: 'en',
      textKnown: 'pes',
      textTarget: 'dog',
      verdict: 'ok',
      suggestedKnown: null,
      suggestedTarget: null,
      suggestionNote: null,
      reviewedBy: 'editor-1',
      heuristicVersion: 1,
      llmAuditVersion: null,
    });
    const update = sqlText(mockExecute.mock.calls[0]?.[0]).split('DO UPDATE SET')[1] ?? '';

    expect(update).not.toContain('heuristic_flags =');
    expect(update).not.toContain('llm_score =');
    expect(update).toContain('reviewed_heuristic_version');
    expect(update).toContain('reviewed_llm_audit_version');
  });
});
