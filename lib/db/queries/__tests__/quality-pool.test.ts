import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();

vi.mock('../../client', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

import { getQualityPool, purgeStaleQualityReviews } from '../quality-pool';

/**
 * Flatten a drizzle SQL template back into searchable text.
 *
 * Chunks are joined with NO separator, because that is how drizzle renders
 * them. Joining with a space (as some other query tests do) fabricates
 * `l .is_public` and `known _ready_count`, which then fail assertions that
 * the real, correctly-concatenated SQL would pass.
 */
function sqlText(query: unknown): string {
  return rawSqlText(query).replace(/\s+/g, ' ').trim();
}

function rawSqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return '';
  return chunks
    .map((chunk) => {
      if (typeof chunk === 'string') return chunk;
      const value = (chunk as { value?: unknown }).value;
      if (Array.isArray(value)) return value.join('');
      if (typeof value === 'string') return value;
      return rawSqlText(chunk);
    })
    .join('');
}

/** The rows query is issued first, the count second (Promise.all order). */
function lastQueries(): { rows: string; count: string } {
  const calls = mockExecute.mock.calls;
  return {
    rows: sqlText(calls[calls.length - 2]?.[0]),
    count: sqlText(calls[calls.length - 1]?.[0]),
  };
}

beforeEach(() => {
  mockExecute.mockReset().mockResolvedValue([]);
});

describe('quality pool consent gating', () => {
  /**
   * The whole feature rests on these four conditions. If any one of them is
   * dropped, private content reaches an editor who was never allowed to see
   * it, so they are asserted individually rather than as one blob.
   */
  it('requires both consent flags, a private list, and a real owner', async () => {
    await getQualityPool();
    const { rows, count } = lastQueries();

    for (const query of [rows, count]) {
      expect(query).toContain('l.is_public = false');
      expect(query).toContain('l.owner_id IS NOT NULL');
      expect(query).toContain('l.review_opt_in = true');
      expect(query).toContain('u.review_opt_in = true');
    }
  });

  it('never selects an owner, list id, or category name', async () => {
    await getQualityPool();
    const { rows } = lastQueries();

    // Identity may be JOINed on (the consent check needs it) but must not be
    // projected. list_id appears only inside count(DISTINCT ...).
    expect(rows).not.toContain('u.email');
    expect(rows).not.toContain('l.owner_id AS');
    expect(rows).not.toContain('l.name');
    expect(rows).not.toContain('c.name');
    expect(rows).toContain('count(DISTINCT i.list_id)');
    // Only the neutral, PII-free label is exposed.
    expect(rows).toContain('c.review_label');
  });

  /**
   * The audit used to need a third key, `users.ai_review_opt_in`, which no
   * switch could set — so it was false everywhere and the audit had nothing to
   * work on. It now runs on the same two keys as the pool, so the SQL must not
   * grow that gate back by accident.
   */
  it('does not gate on the retired third consent key', async () => {
    await getQualityPool();
    expect(lastQueries().rows).not.toContain('ai_review_opt_in');
  });
});

describe('pool key', () => {
  it('is length-prefixed so a separator cannot be forged', async () => {
    await getQualityPool();
    const { rows } = lastQueries();
    // Each component contributes "<length>:<value>" before the '|' join.
    expect(rows).toContain("concat_ws('|'");
    expect(rows).toContain("char_length(lower(l.language_from)) || ':' || lower(l.language_from)");
    expect(rows).toMatch(/char_length\(btrim\(regexp_replace/);
    expect(rows).toContain("'p1:' || md5(");
  });

  it('normalizes NFC, whitespace and trailing dots, but not case', async () => {
    await getQualityPool();
    const { rows } = lastQueries();
    expect(rows).toContain('normalize(i.text_known, NFC)');
    expect(rows).toContain("'\\s+', ' ', 'g'");
    expect(rows).toContain("'\\.+$', ''");
    // Languages are folded; the words are not.
    expect(rows).not.toContain('lower(i.text_known)');
  });
});

describe('audio aggregation', () => {
  /**
   * The bug this guards against: with a plain LEFT JOIN, an item without audio
   * yields [{"id":null,...}] instead of []. Since isSuspiciousSizeForText(null)
   * returns true, "no audio" would then be reported as "suspicious audio".
   */
  it('filters null assets out of the aggregate and defaults to an empty array', async () => {
    await getQualityPool();
    const { rows } = lastQueries();
    expect(rows).toContain('FILTER (WHERE ka.id IS NOT NULL)');
    expect(rows).toContain('FILTER (WHERE ta.id IS NOT NULL)');
    expect(rows.match(/'\[\]'::jsonb/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('counts each state per side instead of collapsing to a boolean', async () => {
    await getQualityPool();
    const { rows } = lastQueries();
    for (const state of ['ready', 'none', 'failed', 'pending']) {
      expect(rows).toContain(`count(*) FILTER (WHERE i.known_audio_status = '${state}')`);
      expect(rows).toContain(`count(*) FILTER (WHERE i.audio_status = '${state}')`);
    }
    // Legacy r2 assets are tracked separately per side, as the UI shows them.
    expect(rows).toContain("count(*) FILTER (WHERE ka.storage_type = 'r2')");
    expect(rows).toContain("count(*) FILTER (WHERE ta.storage_type = 'r2')");
  });

  it('parses per-side counts and assets back out of a row', async () => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValueOnce([
      {
        pool_key: 'p1:abc',
        language_from: 'cs',
        language_to: 'en',
        text_known: 'pes',
        text_target: 'dog',
        occurrences: 14,
        list_count: 9,
        topics: ['Animals'],
        known_ready_count: 4,
        known_missing_count: 10,
        known_failed_count: 0,
        known_pending_count: 0,
        known_legacy_count: 0,
        known_assets: [],
        target_ready_count: 14,
        target_missing_count: 0,
        target_failed_count: 0,
        target_pending_count: 0,
        target_legacy_count: 1,
        target_assets: [
          { id: 'asset-1', hash: 'sha-1', size: 5200, storage: 'object_store' },
        ],
        verdict: 'unreviewed',
        heuristic_flags: [],
        suggestion_version: 0,
      },
    ]);
    mockExecute.mockResolvedValueOnce([{ total: 1 }]);

    const page = await getQualityPool();
    const row = page.rows[0];

    // A pair that is half-done stays visibly half-done.
    expect(row.known.readyCount).toBe(4);
    expect(row.known.missingCount).toBe(10);
    expect(row.known.assets).toEqual([]);
    expect(row.target.assets).toEqual([
      { id: 'asset-1', hash: 'sha-1', size: 5200, storage: 'object_store' },
    ]);
    expect(row.target.legacyCount).toBe(1);
    expect(row.occurrences).toBe(14);
    expect(row.listCount).toBe(9);
    expect(page.total).toBe(1);
  });

  it('distinguishes no audio from partial audio in the filters', async () => {
    await getQualityPool({ audio: 'missing' });
    expect(lastQueries().rows).toContain('p.known_ready_count = 0 AND p.target_ready_count = 0');

    await getQualityPool({ audio: 'incomplete' });
    expect(lastQueries().rows).toContain(
      'p.known_ready_count > 0 AND p.known_ready_count < p.occurrences',
    );
  });

  /**
   * `audio_status` is an enum of four. Naming the failure states (missing = 0
   * AND failed = 0) left `pending` uncounted, so a pair whose clips were still
   * being generated passed the filter as fully recorded. Only the positive
   * form — every occurrence ready — is exhaustive.
   */
  it('does not call a pair with pending clips fully recorded', async () => {
    await getQualityPool({ audio: 'ready' });
    const { rows } = lastQueries();
    expect(rows).toContain('p.known_ready_count = p.occurrences');
    expect(rows).toContain('p.target_ready_count = p.occurrences');
    expect(rows).not.toContain('p.known_missing_count = 0');
  });

  /**
   * The per-side filters exist so an editor can queue "everything still
   * missing the target recording" and act on it in bulk. They therefore have
   * to match what the repair acts on — a partly recorded pair and an
   * unplayable legacy clip are both gaps — or selecting the page would post a
   * request per row and collect failures for pairs that needed nothing.
   */
  it('filters one side at a time on the same gap the repair fills', async () => {
    // Asserted on the WHERE fragment: both sides' counters appear in the
    // SELECT list regardless of the filter.
    await getQualityPool({ audio: 'target_gap' });
    let { rows } = lastQueries();
    expect(rows).toContain(
      'WHERE (p.target_ready_count < p.occurrences OR p.target_legacy_count > 0)',
    );
    expect(rows).not.toContain('p.known_ready_count < p.occurrences');

    await getQualityPool({ audio: 'known_gap' });
    ({ rows } = lastQueries());
    expect(rows).toContain(
      'WHERE (p.known_ready_count < p.occurrences OR p.known_legacy_count > 0)',
    );
    expect(rows).not.toContain('p.target_ready_count < p.occurrences');
  });

  /**
   * `ready` is a status, not a promise of playability: a legacy `r2` asset is
   * linked and ready while the serve route 404s for it. Without this a pair
   * landed in "Fully recorded" and "Legacy" at the same time, and disagreed
   * with `generatePoolAudio`, which treats exactly that case as a gap.
   */
  it('does not call a pair with unplayable legacy clips fully recorded', async () => {
    await getQualityPool({ audio: 'ready' });
    const { rows } = lastQueries();
    expect(rows).toContain('p.known_legacy_count = 0');
    expect(rows).toContain('p.target_legacy_count = 0');
  });
});

describe('sorting and filters', () => {
  it('scores notice-level flags as zero so divergent_targets does not accuse', async () => {
    await getQualityPool({ sort: 'suspicion' });
    const { rows } = lastQueries();
    expect(rows).toContain("WHEN 'high' THEN 5 WHEN 'medium' THEN 2 ELSE 0 END");
  });

  it('treats a missing review row as unreviewed', async () => {
    await getQualityPool({ verdict: 'unreviewed' });
    expect(lastQueries().rows).toContain("COALESCE(r.verdict, 'unreviewed') = 'unreviewed'");
  });

  it('pulls rows judged by an older generation back into the queue', async () => {
    await getQualityPool({ staleOnly: { heuristicVersion: 3, llmAuditVersion: 2 } });
    const { rows } = lastQueries();
    expect(rows).toContain('r.heuristic_version IS DISTINCT FROM');
    expect(rows).toContain('r.llm_audit_version IS DISTINCT FROM');
  });

  it('clamps the page size', async () => {
    const page = await getQualityPool({ limit: 10_000 });
    expect(page.limit).toBe(200);
  });

  it('selects named pairs in SQL rather than leaving it to the caller', async () => {
    await getQualityPool({ poolKeys: ['p1:a', 'p1:b'] });
    const { rows } = lastQueries();
    expect(rows).toContain('p.pool_key = ANY(');
    expect(rows).toContain('p1:a');
    expect(rows).toContain('p1:b');
  });

  /**
   * A caller that asked for specific pairs and named none wants nothing back.
   * Reading an empty list as "no filter" would hand it the entire pool.
   */
  it('returns nothing for an empty key list instead of everything', async () => {
    await getQualityPool({ poolKeys: [] });
    const { rows } = lastQueries();
    expect(rows).toContain('FALSE');
    expect(rows).not.toContain('p.pool_key = ANY(');
  });
});

describe('purge', () => {
  /**
   * The regression this exists for: an earlier design deleted by a
   * `last_seen_at` timestamp that only the scanned rows got refreshed. With a
   * limited scan, that wipes the live corpus. Deletion must be driven by
   * whether a source row still exists, never by a timestamp the scan sets.
   */
  it('deletes by absence of a live source, not by last_seen_at', async () => {
    mockExecute.mockReset().mockResolvedValue([]);
    await purgeStaleQualityReviews();
    const query = sqlText(mockExecute.mock.calls[0]?.[0]);

    expect(query).toContain('DELETE FROM content_quality_reviews');
    expect(query).toContain('WHERE NOT EXISTS');
    expect(query).toContain('FROM word_list_items i');
    expect(query).not.toContain('last_seen_at');
  });

  it('re-applies the full consent condition when looking for a live source', async () => {
    mockExecute.mockReset().mockResolvedValue([]);
    await purgeStaleQualityReviews();
    const query = sqlText(mockExecute.mock.calls[0]?.[0]);

    // A row whose owner withdrew consent has no live source and must go.
    expect(query).toContain('u.review_opt_in = true');
    expect(query).toContain('l.review_opt_in = true');
  });

  it('keeps a suggestion the learner has not answered yet', async () => {
    mockExecute.mockReset().mockResolvedValue([]);
    await purgeStaleQualityReviews();
    const query = sqlText(mockExecute.mock.calls[0]?.[0]);

    expect(query).toContain("r.verdict = 'suggested'");
    expect(query).toContain('content_quality_dismissals');
    expect(query).toContain('d.suggestion_version >= r.suggestion_version');
  });

  it('honours a grace period so a re-added word is not recomputed', async () => {
    mockExecute.mockReset().mockResolvedValue([]);
    await purgeStaleQualityReviews({ graceDays: 30 });
    expect(sqlText(mockExecute.mock.calls[0]?.[0])).toContain("interval '1 day'");
  });
});
