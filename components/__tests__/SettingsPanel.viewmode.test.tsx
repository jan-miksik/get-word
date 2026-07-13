import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';

vi.mock('@/context/AppStateContext', () => ({
  useAppStateContext: () => ({
    role: 'knownLanguage',
    setRole: vi.fn(),
    showEnglish: true,
    setShowEnglish: vi.fn(),
    showCategoryBadges: false,
    setShowCategoryBadges: vi.fn(),
    showPronunciation: false,
    setShowPronunciation: vi.fn(),
    memoryHooksEnabled: true,
    setMemoryHooksEnabled: vi.fn(),
    memoryHookDisableFromStage: 5,
    setMemoryHookDisableFromStage: vi.fn(),
    settingsLanguage: 'en',
    settingsLanguageSelectedAt: '2026-05-01T00:00:00.000Z',
    setSettingsLanguage: vi.fn(),
    userId: null,
    userWalletAddress: null,
    userEmail: null,
    syncedWords: [],
    subscribedLists: [
      { id: 'list-1', name: 'French Basics', languageFrom: 'en', languageTo: 'fr' },
    ],
    activeList: { id: 'list-1', name: 'French Basics', languageFrom: 'en', languageTo: 'fr' },
    activeListId: 'list-1',
  }),
}));

vi.mock('@/components/SettingsLanguagePicker', () => ({
  SettingsLanguagePicker: () => <div data-testid="settings-language-picker" />,
}));

const baseProps = {
  isOpen: true,
};

describe('SettingsPanel settings visibility', () => {
  it('does not render a View section', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.queryByText(/^view$/i)).not.toBeInTheDocument();
  });

  it('does not render display toggles', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.queryByText(/show english/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/category badges/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/show pronunciation/i)).not.toBeInTheDocument();
  });

  it('does not render theme settings', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.queryByText(/^theme$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /default theme/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /warm theme/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /calm theme/i })).not.toBeInTheDocument();
  });

  it('does not render learning-method sections (moved to Learning settings)', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.queryByText(/memory hooks/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/study notes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/how to reveal words/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/quizzes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/frontier features/i)).not.toBeInTheDocument();
  });

  it('does not show wallet addresses in settings for now', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    render(<SettingsPanel {...baseProps} isAuthenticated authAddress={address} />);
    expect(screen.queryByText(address)).not.toBeInTheDocument();
    expect(screen.queryByText(/crypto wallet address/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();
  });

  it('does not render the install app section on desktop', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.queryByText(/^app$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/install app/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/add to home screen/i)).not.toBeInTheDocument();
  });

  it('shows local cache and sync controls in settings', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.getByText(/local data & sync/i)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /cache sounds for active list/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear local learning cache/i })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /save learning data locally/i })).not.toBeInTheDocument();
  });

  it('does not render learning-direction controls', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.queryByText(/i want to learn/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /french/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /english/i })).not.toBeInTheDocument();
  });
});
