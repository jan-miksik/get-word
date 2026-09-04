import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TypingOptionsSubsection } from '../TypingOptionsSubsection';

const setTypingAudioReplayHideFromStage = vi.fn();

vi.mock('@/context/AppStateContext', () => ({
  useAppStateContext: () => ({
    typingPrefillPunctuation: false,
    setTypingPrefillPunctuation: vi.fn(),
    typingMobileKeyboardAutoFocus: false,
    setTypingMobileKeyboardAutoFocus: vi.fn(),
    typingAudioReplayHideFromStage: 5,
    setTypingAudioReplayHideFromStage,
  }),
}));

describe('TypingOptionsSubsection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the current replay-button cutoff and lets it be changed', async () => {
    render(<TypingOptionsSubsection />);
    const select = screen.getByRole('combobox', { name: /hide replay button/i });
    expect(select).toHaveValue('5');

    await userEvent.selectOptions(select, '4');
    expect(setTypingAudioReplayHideFromStage).toHaveBeenCalledWith(4);
  });
});
