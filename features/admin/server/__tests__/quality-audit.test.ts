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

describe('malformed model output', () => {
  /**
   * A model that echoes one index twice used to produce two upsert entries for
   * the same pool key, and PostgreSQL rejects an INSERT … ON CONFLICT DO UPDATE
   * that touches a row twice — losing the whole batch over one duplicated line.
   */
  it('keeps one judgement per index when the model repeats one', async () => {
    pool([
      { poolKey: 'p1:a', aiConsent: true },
      { poolKey: 'p1:b', aiConsent: true },
    ]);
    callOpenRouterChatParsed.mockImplementation(
      async (_options: unknown, parse: (content: string) => unknown) =>
        parse(
          JSON.stringify({
            results: [
              { index: 0, score: 90, reason: 'first', suggestion: null },
              { index: 0, score: 10, reason: 'duplicate', suggestion: 'nope' },
              { index: 1, score: 80, reason: 'second', suggestion: null },
            ],
          }),
        ),
    );

    const result = await auditQualityPool({ maxItems: 10 });

    const entries = upsertQualityAudit.mock.calls[0][0] as { poolKey: string; score: number }[];
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.poolKey).sort()).toEqual(['p1:a', 'p1:b']);
    // First answer wins, so the duplicate does not overwrite the real score.
    expect(entries.find((entry) => entry.poolKey === 'p1:a')?.score).toBe(90);
    expect(result.audited).toBe(2);
  });
});

describe('auditing named pairs', () => {
  /**
   * Selecting by key has to happen in SQL. Trimming a suspicion-sorted page
   * afterwards silently dropped any key that did not land on it, and reported
   * `audited: 0` with nothing to explain why.
   */
  it('asks the database for the named keys instead of filtering a page', async () => {
    pool([{ poolKey: 'p1:wanted', aiConsent: true }]);
    respondOk();

    const result = await auditQualityPool({ poolKeys: ['p1:wanted'], maxItems: 10 });

    expect(getQualityPool).toHaveBeenCalledWith(
      expect.objectContaining({ poolKeys: ['p1:wanted'] }),
    );
    expect(result.audited).toBe(1);
  });
});
