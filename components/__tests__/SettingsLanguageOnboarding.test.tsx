import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../I18nProvider';
import { SettingsLanguageOnboarding } from '../SettingsLanguageOnboarding';

const mockSetSettingsLanguage = vi.fn();
const mockSyncUserData = vi.fn();

vi.mock('@/context/AppStateContext', () => ({
  useAppStateContext: () => ({
    settingsLanguage: 'en',
    settingsLanguageSelectedAt: null,
    setSettingsLanguage: mockSetSettingsLanguage,
  }),
}));

vi.mock('@/lib/sync', () => ({
  syncUserData: (...args: unknown[]) => mockSyncUserData(...args),
}));

describe('SettingsLanguageOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncUserData.mockResolvedValue({});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        languages: [
          { code: 'en', name: 'English', source: 'common' },
          { code: 'de', name: 'German', source: 'google' },
        ],
      }),
    }));
  });

  it('always shows Czech, Vietnamese, and English as featured languages without waiting for API', () => {
    render(
      <I18nProvider language="en">
        <SettingsLanguageOnboarding />
      </I18nProvider>,
    );

    expect(screen.getByText('Czech')).toBeInTheDocument();
    expect(screen.getByText('Vietnamese')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('shows a globe icon and the onboarding title', () => {
    render(
      <I18nProvider language="en">
        <SettingsLanguageOnboarding />
      </I18nProvider>,
    );

    expect(screen.getByText('🌐')).toBeInTheDocument();
    expect(screen.getByText('Choose your app language')).toBeInTheDocument();
  });

  it('continue button reflects the currently selected language name', async () => {
    render(
      <I18nProvider language="en">
        <SettingsLanguageOnboarding />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /German/i }));

    expect(screen.getByRole('button', { name: /Continue with German/i })).toBeInTheDocument();
  });

  it('hides non-matching pills when searching and restores them when cleared', async () => {
    render(
      <I18nProvider language="en">
        <SettingsLanguageOnboarding />
      </I18nProvider>,
    );

    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'ger' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /German/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Vietnamese/i })).not.toBeInTheDocument();
    });

    fireEvent.change(search, { target: { value: '' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Vietnamese/i })).toBeInTheDocument();
    });
  });

  it('saves the selected language on confirm', async () => {
    render(
      <I18nProvider language="en">
        <SettingsLanguageOnboarding />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /German/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue with German/i }));

    await waitFor(() => {
      expect(mockSetSettingsLanguage).toHaveBeenCalledWith('de');
      expect(mockSyncUserData).toHaveBeenCalledWith({ settings_language: 'de' });
    });
  });
});
