import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LearningSettingsPanel } from '../LearningSettingsPanel';

const contextOverrides: Record<string, unknown> = {};

vi.mock('@/context/AppStateContext', () => ({
  useAppStateContext: () => ({
    memoryHooksEnabled: true,
    setMemoryHooksEnabled: vi.fn(),
    memoryHookDisableFromStage: 5,
    setMemoryHookDisableFromStage: vi.fn(),
    studyNotesEnabled: true,
    setStudyNotesEnabled: vi.fn(),
    studyNoteMinimizeFromStage: 5,
    setStudyNoteMinimizeFromStage: vi.fn(),
    revealMode: 'scratch',
    setRevealMode: vi.fn(),
    swipeCardsEnabled: false,
    setSwipeCardsEnabled: vi.fn(),
    tiltGameEnabled: false,
    setTiltGameEnabled: vi.fn(),
    photoLabEnabled: false,
    setPhotoLabEnabled: vi.fn(),
    typingModeEnabled: false,
    setTypingModeEnabled: vi.fn(),
    typingWriteIn: 'foreign',
    setTypingWriteIn: vi.fn(),
    typingAudioPromptEnabled: true,
    setTypingAudioPromptEnabled: vi.fn(),
    typingPrefillPunctuation: true,
    setTypingPrefillPunctuation: vi.fn(),
    typingMobileKeyboardAutoFocus: false,
    setTypingMobileKeyboardAutoFocus: vi.fn(),
    typingPlayAudioAfterCheck: false,
    setTypingPlayAudioAfterCheck: vi.fn(),
    typingCheckButtonEnabled: false,
    setTypingCheckButtonEnabled: vi.fn(),
    ...contextOverrides,
  }),
}));

beforeEach(() => {
  for (const key of Object.keys(contextOverrides)) delete contextOverrides[key];
});

const baseProps = {
  minigameFrequency: { min: 2, max: 4 } as const,
  onMinigameFrequencyChange: vi.fn(),
  isOpen: true,
};

describe('LearningSettingsPanel', () => {
  it('renders the learning-method sections in order with frontier features last', () => {
    render(<LearningSettingsPanel {...baseProps} />);

    const labels = [
      /^learning by typing$/i,
      /^memory hooks$/i,
      /^study notes$/i,
      /^how to reveal words$/i,
      /^quizzes$/i,
      /^frontier features$/i,
    ].map((pattern) => screen.getAllByText(pattern)[0]);
    labels.forEach((label) => expect(label).toBeInTheDocument());
    for (let i = 1; i < labels.length; i++) {
      const position = labels[i - 1].compareDocumentPosition(labels[i]);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('renames the quizzes section and keeps its toggle switch', () => {
    render(<LearningSettingsPanel {...baseProps} />);
    expect(screen.getByRole('switch', { name: /quizzes/i })).toBeInTheDocument();
    expect(screen.queryByText(/mini-games/i)).not.toBeInTheDocument();
  });

  it('visually separates the frontier features section', () => {
    render(<LearningSettingsPanel {...baseProps} />);
    const frontierWrap = screen.getByText(/^frontier features$/i).closest('.border-dashed');
    expect(frontierWrap).not.toBeNull();
  });

  it('does not render general app sections (kept in Settings)', () => {
    render(<LearningSettingsPanel {...baseProps} />);
    expect(screen.queryByText(/local data & sync/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^account$/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-language-picker')).not.toBeInTheDocument();
    expect(screen.queryByText(/interface language/i)).not.toBeInTheDocument();
  });

  it('hides the typing sub-settings while the main toggle is off', () => {
    render(<LearningSettingsPanel {...baseProps} />);
    expect(screen.getByRole('switch', { name: /learning by typing/i })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: /write in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /audio prompts/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: /prefill commas, periods and spaces/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: /autofocus keyboard on mobile/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: /play audio after checking/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: /show check button/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the write-in radio and typing options without audio prompts', () => {
    contextOverrides.typingModeEnabled = true;
    render(<LearningSettingsPanel {...baseProps} />);
    const radios = screen.getAllByRole('radio');
    const writeInRadios = radios.filter((radio) =>
      /foreign language only|both languages|known language only/i.test(radio.textContent ?? ''),
    );
    expect(writeInRadios).toHaveLength(3);
    expect(
      writeInRadios.find((radio) => /foreign language only/i.test(radio.textContent ?? '')),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('switch', { name: /audio prompts/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: /prefill commas, periods and spaces/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: /autofocus keyboard on mobile/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: /play audio after checking/i }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('switch', { name: /check the answer with a button/i }),
    ).not.toBeChecked();
    expect(
      screen.getByText(/the answer is not checked automatically after you type the last letter/i),
    ).toBeInTheDocument();
  });
});
