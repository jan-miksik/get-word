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
