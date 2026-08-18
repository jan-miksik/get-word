'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/features/shared/http/api-runtime';
import type {
  QualityPoolQuery,
  QualityPoolResponse,
} from '@/features/admin/quality-types';

export type QualityPoolLoadState =
  | { status: 'loading' }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | { status: 'ready'; page: QualityPoolResponse };

export const DEFAULT_PAGE_SIZE = 50;

/** Server caps the page at 200 (`MAX_LIMIT` in the pool query). */
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

export type BulkProgress = { done: number; total: number };

export type BulkOutcome = {
  ok: number;
  failures: { poolKey: string; error: string }[];
};

function buildParams(query: QualityPoolQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.languageFrom) params.set('languageFrom', query.languageFrom);
  if (query.languageTo) params.set('languageTo', query.languageTo);
  if (query.search) params.set('search', query.search);
  if (query.audio && query.audio !== 'any') params.set('audio', query.audio);
  if (query.flags && query.flags.length > 0) params.set('flags', query.flags.join(','));
  if (query.verdict && query.verdict !== 'any') params.set('verdict', query.verdict);
  if (typeof query.maxLlmScore === 'number') {
    params.set('maxLlmScore', String(query.maxLlmScore));
  }
  if (query.staleOnly) params.set('staleOnly', 'true');
  if (query.sort) params.set('sort', query.sort);
  params.set('limit', String(query.limit ?? DEFAULT_PAGE_SIZE));
  params.set('offset', String(query.offset ?? 0));
  return params;
}

async function requestPool(query: QualityPoolQuery): Promise<QualityPoolLoadState> {
  try {
    const response = await apiFetch(`/api/admin/quality?${buildParams(query)}`, {
      credentials: 'same-origin',
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (response.status === 403) return { status: 'forbidden' };
    if (!response.ok) return { status: 'error' };
    return { status: 'ready', page: (await response.json()) as QualityPoolResponse };
  } catch {
    return { status: 'error' };
  }
}

async function postJson(url: string, body: unknown, method = 'POST') {
  const response = await apiFetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'Request failed');
  return payload;
}

export function useQualityPool() {
  const [query, setQuery] = useState<QualityPoolQuery>({
    sort: 'suspicion',
    audio: 'any',
    verdict: 'any',
    limit: DEFAULT_PAGE_SIZE,
    offset: 0,
  });
  const [state, setState] = useState<QualityPoolLoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState(await requestPool(query));
  }, [query]);

  useEffect(() => {
    // Debounced so typing in the search box does not fire a query per keypress
    // against a corpus-wide aggregate.
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    void load();
  }, [load]);

  /** Any filter change resets paging; staying on page 7 of a new filter is never right. */
  const updateQuery = useCallback((patch: Partial<QualityPoolQuery>) => {
    setState({ status: 'loading' });
    setQuery((previous) => ({ ...previous, ...patch, offset: patch.offset ?? 0 }));
  }, []);

  const goToOffset = useCallback((offset: number) => {
    setState({ status: 'loading' });
    setQuery((previous) => ({ ...previous, offset: Math.max(offset, 0) }));
  }, []);

  const pagination = useMemo(() => {
    if (state.status !== 'ready') return null;
    const { total, limit, offset } = state.page;
    return {
      total,
      limit,
      offset,
      from: total === 0 ? 0 : offset + 1,
      to: Math.min(offset + limit, total),
      hasPrevious: offset > 0,
      hasNext: offset + limit < total,
    };
  }, [state]);

  /** Record a verdict, then refresh so the row reflects it. */
  const saveVerdict = useCallback(
    async (
      poolKey: string,
      input: {
        verdict: 'ok' | 'suspect' | 'suggested';
        suggestedKnown?: string | null;
        suggestedTarget?: string | null;
        note?: string | null;
      },
    ) => {
      await postJson(`/api/admin/quality/${encodeURIComponent(poolKey)}`, input, 'PATCH');
      await load();
    },
    [load],
  );

  const generateAudio = useCallback(
    async (poolKey: string, side: 'known' | 'target') => {
      const result = (await postJson('/api/admin/quality/audio', { poolKey, side })) as {
        linked_items?: number;
      };
      await load();
      return result;
    },
    [load],
  );

  /**
   * Run one action over many pairs, one request at a time.
   *
   * Sequential on purpose. Each recording is a Google TTS call behind a shared
   * per-minute pacer, and a hundred parallel requests would spend the whole
   * run backing off. It also keeps a failure attributable to its pair instead
   * of collapsing the batch, and lets the caller show real progress.
   *
   * The pool is refreshed once at the end, not per pair — a reload between
   * every request would re-sort the table under the editor mid-run.
   */
  const runBulk = useCallback(
    async (
      poolKeys: string[],
      request: (poolKey: string) => Promise<unknown>,
      onProgress?: (progress: BulkProgress) => void,
    ): Promise<BulkOutcome> => {
      const failures: BulkOutcome['failures'] = [];
      let ok = 0;
      for (const poolKey of poolKeys) {
        try {
          await request(poolKey);
          ok += 1;
        } catch (error) {
          failures.push({
            poolKey,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        onProgress?.({ done: ok + failures.length, total: poolKeys.length });
      }
      await load();
      return { ok, failures };
    },
    [load],
  );

  const generateAudioBulk = useCallback(
    (
      poolKeys: string[],
      side: 'known' | 'target',
      onProgress?: (progress: BulkProgress) => void,
    ) =>
      runBulk(
        poolKeys,
        (poolKey) => postJson('/api/admin/quality/audio', { poolKey, side }),
        onProgress,
      ),
    [runBulk],
  );

  const markOkBulk = useCallback(
    (poolKeys: string[], onProgress?: (progress: BulkProgress) => void) =>
      runBulk(
        poolKeys,
        (poolKey) =>
          postJson(
            `/api/admin/quality/${encodeURIComponent(poolKey)}`,
            { verdict: 'ok' },
            'PATCH',
          ),
        onProgress,
      ),
    [runBulk],
  );

  /**
   * Score the named pairs with the external model — one request, not one per
   * pair: the audit batches them into a handful of model calls, and the server
   * caps a run at `MAX_AUDIT_ITEMS`.
   */
  const auditPairs = useCallback(
    async (poolKeys: string[]) => {
      const result = (await postJson('/api/admin/quality/audit', {
        poolKeys,
        maxItems: poolKeys.length,
      })) as { audited?: number; cached?: number };
      await load();
      return result;
    },
    [load],
  );

  return {
    state,
    query,
    updateQuery,
    goToOffset,
    reload,
    pagination,
    saveVerdict,
    generateAudio,
    generateAudioBulk,
    markOkBulk,
    auditPairs,
  };
}
