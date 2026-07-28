'use client';

import { InterfaceLanguageSelector } from '@/components/InterfaceLanguageSelector';
import { useOptionalAppStateContext } from '@/context/AppStateContext';

type Props = {
  align?: 'left' | 'right';
  className?: string;
  compact?: boolean;
};

/**
 * App-state-connected interface-language selector. Keeping this wrapper in the
 * shared language feature lets onboarding and feature-specific settings reuse
 * the same control without depending on each other.
 */
export function AppInterfaceLanguageSelector({
  align = 'left',
  className,
  compact = false,
}: Props) {
  const appState = useOptionalAppStateContext();
  if (!appState) return null;

  return (
    <InterfaceLanguageSelector
      value={appState.settingsLanguage}
      onChange={appState.setSettingsLanguage}
      align={align}
      className={className}
      compact={compact}
    />
  );
}
