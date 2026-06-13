import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../I18nProvider';
import { SettingsLanguagePicker } from '../SettingsLanguagePicker';
import { OnboardingLanguageSwitcher } from '@/features/learning/onboarding/OnboardingLanguageSwitcher';

const mocks = vi.hoisted(() => ({
  setSettingsLanguage: vi.fn(),
}));

vi.mock('@/context/AppStateContext', () => ({
  useOptionalAppStateContext: () => ({
    settingsLanguage: 'en',
    setSettingsLanguage: mocks.setSettingsLanguage,
  }),
}));

describe('interface language selector reuse', () => {
  it('renders the shared selector in settings', () => {
    render(
      <I18nProvider language="en">
        <SettingsLanguagePicker value="en" onChange={vi.fn()} compact />
      </I18nProvider>,
    );

    expect(screen.getByTestId('interface-language-selector')).toBeInTheDocument();
  });

  it('renders the shared selector in onboarding', () => {
    render(
      <I18nProvider language="en">
        <OnboardingLanguageSwitcher />
      </I18nProvider>,
    );

    expect(screen.getByTestId('interface-language-selector')).toBeInTheDocument();
  });
});
