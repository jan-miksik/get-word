'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ActivityWindow, UsageStats } from '@/features/admin/types';
import { apiFetch } from '@/features/shared/http/api-runtime';

export type AdminStatsLoadState =
  | { status: 'loading' }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | { status: 'ready'; stats: UsageStats };

async function requestAdminStats(activityWindow: ActivityWindow): Promise<AdminStatsLoadState> {
  try {
    const params = new URLSearchParams({ activityWindow });
    const response = await apiFetch(`/api/admin/stats?${params}`, { credentials: 'same-origin' });
    if (response.status === 401) return { status: 'unauthorized' };
    if (response.status === 403) return { status: 'forbidden' };
    if (!response.ok) return { status: 'error' };
    return { status: 'ready', stats: (await response.json()) as UsageStats };
  } catch {
    return { status: 'error' };
  }
}

export function useAdminStats() {
  const [state, setState] = useState<AdminStatsLoadState>({ status: 'loading' });
  const [activityWindow, setActivityWindow] = useState<ActivityWindow>('rolling');

  const load = useCallback(async () => {
    setState(await requestAdminStats(activityWindow));
  }, [activityWindow]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
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
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  return { state, activityWindow, reload, changeActivityWindow };
}
