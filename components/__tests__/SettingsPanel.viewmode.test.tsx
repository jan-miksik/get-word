import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('SettingsPanel viewMode toggle', () => {
  it('renders a View Mode toggle', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.getByText(/view mode/i)).toBeInTheDocument();
  });

  it('shows "Card" label when viewMode is card', () => {
    render(<SettingsPanel {...baseProps} viewMode="card" />);
    expect(screen.getByText('Card')).toBeInTheDocument();
  });

  it('shows "Stream" label when viewMode is stream', () => {
    render(<SettingsPanel {...baseProps} viewMode="stream" />);
    expect(screen.getByText('Stream')).toBeInTheDocument();
  });

  it('calls onViewModeChange with "stream" when toggled from card', async () => {
    const onChange = vi.fn();
    render(<SettingsPanel {...baseProps} viewMode="card" onViewModeChange={onChange} />);
    await userEvent.click(screen.getByRole('switch', { name: /view mode/i }));
    expect(onChange).toHaveBeenCalledWith('stream');
  });

  it('calls onViewModeChange with "card" when toggled from stream', async () => {
    const onChange = vi.fn();
    render(<SettingsPanel {...baseProps} viewMode="stream" onViewModeChange={onChange} />);
    await userEvent.click(screen.getByRole('switch', { name: /view mode/i }));
    expect(onChange).toHaveBeenCalledWith('card');
  });
});
