'use client';

import { InterfaceLanguageSelector } from '@/components/InterfaceLanguageSelector';
import { useOptionalAppStateContext } from '@/context/AppStateContext';

export function OnboardingLanguageSwitcher() {
  const appState = useOptionalAppStateContext();
  if (!appState) return null;

  return (
    <InterfaceLanguageSelector
      value={appState.settingsLanguage}
      onChange={appState.setSettingsLanguage}
      align="right"
    />
  );
}
