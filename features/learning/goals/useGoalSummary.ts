'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GoalSummarySchema, type GoalSummary } from '@/packages/contracts/src/goals';
import { apiFetch } from '@/features/shared/http/api-runtime';

async function fetchGoalSummary(): Promise<GoalSummary> {
  const response = await apiFetch('/api/goals/summary', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Goal summary failed: ${response.status}`);
  // Parsed, not cast: the goal drives the session plan and the day rollup, so a
  // shape change should fail loudly here rather than three hops later.
  return GoalSummarySchema.parse(await response.json());
}

export function useGoalSummary(enabled: boolean, scopeKey = 'default') {
  const [result, setResult] = useState<{ scopeKey: string; summary: GoalSummary } | null>(null);
  const [failure, setFailure] = useState<{ scopeKey: string; error: Error } | null>(null);
  const requestIdRef = useRef(0);
  const summary = result?.scopeKey === scopeKey ? result.summary : null;
  const error = failure?.scopeKey === scopeKey ? failure.error : null;

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const next = await fetchGoalSummary();
      if (requestId === requestIdRef.current) {
        setResult({ scopeKey, summary: next });
        setFailure(null);
      }
    } catch (cause) {
      if (requestId === requestIdRef.current) {
        setFailure({
          scopeKey,
          error: cause instanceof Error ? cause : new Error('Goal summary failed'),
        });
      }
    }
  }, [scopeKey]);

  useEffect(() => {
    if (!enabled) return;
    const timeoutId = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearTimeout(timeoutId);
      requestIdRef.current += 1;
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onServerSync = () => void refresh();
    window.addEventListener('get-word:server-sync', onServerSync);
    return () => window.removeEventListener('get-word:server-sync', onServerSync);
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onRefresh = () => void refresh();
    window.addEventListener('get-word:refresh-goal-summary', onRefresh);
    return () => window.removeEventListener('get-word:refresh-goal-summary', onRefresh);
  }, [enabled, refresh]);

  return {
    summary: enabled ? summary : null,
    error: enabled ? error : null,
    isLoading: enabled && summary === null && error === null,
    refresh,
  };
}
