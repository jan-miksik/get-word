'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { OnboardingProgressStep } from './OnboardingProgress';

type NavigateToStep = (step: OnboardingProgressStep) => void;

const OnboardingProgressNavigationContext = createContext<NavigateToStep | null>(null);

/** Makes completed onboarding progress segments navigate to their saved step. */
export function OnboardingProgressNavigationProvider({
  onNavigate,
  children,
}: {
  onNavigate: NavigateToStep;
  children: ReactNode;
}) {
  return (
    <OnboardingProgressNavigationContext.Provider value={onNavigate}>
      {children}
    </OnboardingProgressNavigationContext.Provider>
  );
}

export function useOnboardingProgressNavigation() {
  return useContext(OnboardingProgressNavigationContext);
}
