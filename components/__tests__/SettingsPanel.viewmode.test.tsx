import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';

vi.mock('@/context/AppStateContext', () => ({
  useAppStateContext: () => ({
    role: 'cz',
    setRole: vi.fn(),
    showEnglish: true,
    setShowEnglish: vi.fn(),
    showCategoryBadges: false,
    setShowCategoryBadges: vi.fn(),
    showPronunciation: false,
    setShowPronunciation: vi.fn(),
    memoryHooksEnabled: true,
    setMemoryHooksEnabled: vi.fn(),
    memoryHookDisableFromStage: 8,
    setMemoryHookDisableFromStage: vi.fn(),
    theme: 'default',
    setTheme: vi.fn(),
    userId: null,
    userWalletAddress: null,
    userEmail: null,
  }),
}));

const baseProps = {
  minigameFrequency: { min: 2, max: 4 } as const,
  onMinigameFrequencyChange: vi.fn(),
  isOpen: true,
  viewMode: 'card' as const,
  onViewModeChange: vi.fn(),
};

describe('SettingsPanel settings visibility', () => {
  it('does not render a View section', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.queryByText(/^view$/i)).not.toBeInTheDocument();
  });

  it('does not render display toggles', () => {
    render(<SettingsPanel {...baseProps} viewMode="card" />);
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

  it('keeps the mini-games switch on the section label without the old stream text', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.getByText(/mini-games/i)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /show mini-games in stream/i })).toBeInTheDocument();
    expect(screen.queryByText(/show in stream/i)).not.toBeInTheDocument();
  });

  it('shows the full wallet address with a copy button', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    render(<SettingsPanel {...baseProps} isAuthenticated authAddress={address} />);
    expect(screen.getByText(address)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy wallet address/i })).toBeInTheDocument();
  });

  it('does not render the install app section on desktop', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.queryByText(/^app$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/install app/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/add to home screen/i)).not.toBeInTheDocument();
  });
});
