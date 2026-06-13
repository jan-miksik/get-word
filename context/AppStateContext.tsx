'use client';

import { createContext, useContext } from 'react';
import type { useAppState } from '@/hooks/useAppState';

export type AppStateContextValue = ReturnType<typeof useAppState>;

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({
  value,
  children,
}: {
  value: AppStateContextValue;
  children: React.ReactNode;
}) {
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppStateContext(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppStateContext must be used within AppStateProvider');
  return ctx;
}

/**
 * Non-throwing variant for components that are usually — but not always —
 * rendered inside an AppStateProvider (e.g. optional chrome that may be mounted
 * in isolation by tests). Returns null when no provider is present.
 */
export function useOptionalAppStateContext(): AppStateContextValue | null {
  return useContext(AppStateContext);
}
