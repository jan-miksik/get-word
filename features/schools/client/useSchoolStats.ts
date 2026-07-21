'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityWindow } from '@/lib/stats/types';
import type { SchoolUsageStats } from '@/features/schools/types';

export type SchoolStatsLoadState =
  | { status: 'loading' }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'notFound' }
  | { status: 'error' }
  | { status: 'ready'; stats: SchoolUsageStats };

async function requestSchoolStats(
  endpoint: string,
  activityWindow: ActivityWindow,
): Promise<SchoolStatsLoadState> {
  try {
    const params = new URLSearchParams({ activityWindow });
    const response = await fetch(`${endpoint}?${params}`, { credentials: 'same-origin' });
    if (response.status === 401) return { status: 'unauthorized' };
    if (response.status === 403) return { status: 'forbidden' };
    if (response.status === 404) return { status: 'notFound' };
    if (!response.ok) return { status: 'error' };
    return { status: 'ready', stats: (await response.json()) as SchoolUsageStats };
  } catch {
    return { status: 'error' };
  }
}

/**
 * Loads one school's dashboard. `endpoint` differs per audience — teachers hit
 * their own school, editors hit a chosen one — so the hook never knows a
 * school id itself.
 */
export function useSchoolStats(endpoint: string) {
  const [state, setState] = useState<SchoolStatsLoadState>({ status: 'loading' });
  const [activityWindow, setActivityWindow] = useState<ActivityWindow>('rolling');
  // Guards against a slow response from a previous endpoint/window landing
  // after a newer request has already been issued.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState({ status: 'loading' });
    const next = await requestSchoolStats(endpoint, activityWindow);
    if (requestIdRef.current === requestId) setState(next);
  }, [endpoint, activityWindow]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  const changeActivityWindow = useCallback((next: ActivityWindow) => {
    setState({ status: 'loading' });
    setActivityWindow(next);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      // Discard anything still in flight when the endpoint changes or we unmount.
      requestIdRef.current += 1;
    };
  }, [load]);

  return { state, activityWindow, reload, changeActivityWindow };
}
