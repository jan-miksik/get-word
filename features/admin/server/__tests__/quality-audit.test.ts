import { describe, expect, it, vi, beforeEach } from 'vitest';

const getQualityPool = vi.fn();
const upsertQualityAudit = vi.fn();
const callOpenRouterChatParsed = vi.fn();

vi.mock('@/lib/db/client', () => ({ db: { execute: vi.fn() } }));
vi.mock('@/lib/db/queries/quality-pool', () => ({
  getQualityPool: (...args: unknown[]) => getQualityPool(...args),
  upsertQualityAudit: (...args: unknown[]) => upsertQualityAudit(...args),
}));
vi.mock('@/lib/openrouter-chat', () => ({
  callOpenRouterChatParsed: (...args: unknown[]) => callOpenRouterChatParsed(...args),
  parseJsonLoose: (value: string) => JSON.parse(value),
  OpenRouterChatError: class extends Error {},
}));

import { auditQualityPool } from '../quality-audit';
import { LLM_AUDIT_VERSION } from '../quality-versions';

type Row = {
  poolKey: string;
  aiConsent: boolean;
  occurrences?: number;
  review?: { llmAuditVersion: number | null; heuristicFlags: [] } | null;
};

function pool(rows: Row[]) {
  getQualityPool.mockResolvedValue({
    rows: rows.map((row) => ({
      poolKey: row.poolKey,
      languageFrom: 'cs',
      languageTo: 'en',
      textKnown: 'pes',
      textTarget: 'dog',
      normKnown: 'pes',
      normTarget: 'dog',
      occurrences: row.occurrences ?? 1,
      listCount: 1,
      topics: [],
      aiConsent: row.aiConsent,
      known: { readyCount: 0, missingCount: 1, failedCount: 0, pendingCount: 0, legacyCount: 0, assets: [] },
      target: { readyCount: 0, missingCount: 1, failedCount: 0, pendingCount: 0, legacyCount: 0, assets: [] },
      review: row.review ?? null,
    })),
    total: rows.length,
    limit: 200,
    offset: 0,
  });
}

/** Every batch scores each item 90 with no suggestion. */
function respondOk() {
  callOpenRouterChatParsed.mockImplementation(async (options: unknown, parse: (c: string) => unknown) => {
    const message = (options as { messages: { content: string }[] }).messages[1].content;
    const items = JSON.parse(message.slice(message.indexOf('Items:') + 6)) as { index: number }[];
    return parse(
      JSON.stringify({
        results: items.map((item) => ({ index: item.index, score: 90, reason: 'fine', suggestion: null })),
      }),
    );
  });
}

beforeEach(() => {
  getQualityPool.mockReset();
  upsertQualityAudit.mockReset().mockResolvedValue(0);
  callOpenRouterChatParsed.mockReset();
  process.env.OPENROUTER_SERVER_API_KEY = 'test-key';
});

describe('AI review consent', () => {
  /**
   * The only place in the pool that sends content to a third party. A pair is
   * either fully sendable or not sent at all, so one owner without the
   * consent must keep the whole aggregated pair back.
   */
  it('never sends a pair whose owners have not all opted in', async () => {
    pool([
      { poolKey: 'p1:no', aiConsent: false },
      { poolKey: 'p1:yes', aiConsent: true },
    ]);
    respondOk();

    const result = await auditQualityPool({ maxItems: 10 });

    expect(result.skippedNoConsent).toBe(1);
    expect(result.audited).toBe(1);

    const sent = callOpenRouterChatParsed.mock.calls
      .map((call) => (call[0] as { messages: { content: string }[] }).messages[1].content)
      .join('\n');
    expect(sent).not.toContain('p1:no');
    expect(upsertQualityAudit.mock.calls[0][0]).toHaveLength(1);
  });

  it('sends nothing at all when no pair has consent', async () => {
    pool([{ poolKey: 'p1:a', aiConsent: false }, { poolKey: 'p1:b', aiConsent: false }]);
    respondOk();

    const result = await auditQualityPool({ maxItems: 10 });

    expect(result.audited).toBe(0);
    expect(result.skippedNoConsent).toBe(2);
    expect(callOpenRouterChatParsed).not.toHaveBeenCalled();
  });
});

describe('audit cost control', () => {
  it('does not pay twice for a pair already scored at this version', async () => {
    pool([
      { poolKey: 'p1:cached', aiConsent: true, review: { llmAuditVersion: LLM_AUDIT_VERSION, heuristicFlags: [] } },
      { poolKey: 'p1:fresh', aiConsent: true },
    ]);
    respondOk();

    const result = await auditQualityPool({ maxItems: 10 });

    expect(result.cached).toBe(1);
    expect(result.audited).toBe(1);
  });

  /** Bumping the audit version has to invalidate every stored score. */
  it('re-audits a pair scored by an older generation', async () => {
    pool([
      { poolKey: 'p1:old', aiConsent: true, review: { llmAuditVersion: LLM_AUDIT_VERSION - 1, heuristicFlags: [] } },
    ]);
    respondOk();

    const result = await auditQualityPool({ maxItems: 10 });

    expect(result.cached).toBe(0);
    expect(result.audited).toBe(1);
  });

  it('honours the per-run ceiling', async () => {
    pool(
      Array.from({ length: 40 }, (_, index) => ({ poolKey: `p1:${index}`, aiConsent: true })),
    );
    respondOk();

    const result = await auditQualityPool({ maxItems: 5 });
    expect(result.audited).toBe(5);
  });
});
