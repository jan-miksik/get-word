import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FrontierFeaturesSection } from '../FrontierFeaturesSection';

const setSwipeCardsEnabled = vi.fn();
const setTiltGameEnabled = vi.fn();
let swipeCardsEnabled = false;
let tiltGameEnabled = false;

vi.mock('@/context/AppStateContext', () => ({
  useAppStateContext: () => ({
    swipeCardsEnabled,
    setSwipeCardsEnabled,
    tiltGameEnabled,
    setTiltGameEnabled,
    photoLabEnabled: false,
    setPhotoLabEnabled: vi.fn(),
  }),
}));

describe('FrontierFeaturesSection', () => {
  beforeEach(() => {
    setSwipeCardsEnabled.mockClear();
    setTiltGameEnabled.mockClear();
    swipeCardsEnabled = false;
    tiltGameEnabled = false;
  });

  it('enables the tilt quiz independently', async () => {
    render(<FrontierFeaturesSection />);
    await userEvent.click(screen.getByRole('switch', { name: /tilt choice quiz/i }));
    expect(setTiltGameEnabled).toHaveBeenCalledWith(true);
  });

  it('renders the section with the swipe toggle off by default', () => {
    render(<FrontierFeaturesSection />);
    expect(screen.getByText(/frontier features/i)).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: /swipe cards/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('enables the feature when the toggle is clicked', async () => {
    render(<FrontierFeaturesSection />);
    await userEvent.click(screen.getByRole('switch', { name: /swipe cards/i }));
    expect(setSwipeCardsEnabled).toHaveBeenCalledWith(true);
  });

  it('disables the feature when toggled while on', async () => {
    swipeCardsEnabled = true;
    render(<FrontierFeaturesSection />);
    const toggle = screen.getByRole('switch', { name: /swipe cards/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);
    expect(setSwipeCardsEnabled).toHaveBeenCalledWith(false);
  });
});
