import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LearningSettingsPanel } from '../LearningSettingsPanel';
import { DEFAULT_FINE_TUNE_CONFIG } from '@/features/learning/fine-tune/config';

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
    learningFineTune: DEFAULT_FINE_TUNE_CONFIG,
    setLearningFineTune: vi.fn(),
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
  minigameFrequency: { min: 2, max: 3 } as const,
  onMinigameFrequencyChange: vi.fn(),
  isOpen: true,
};

describe('LearningSettingsPanel', () => {
  it('uses a larger desktop dialog', () => {
    const { container } = render(<LearningSettingsPanel {...baseProps} />);

    expect(container.querySelector('.learning-settings-panel')).toHaveClass(
      'md:!w-[calc(100vw-2rem)]',
      'md:!max-w-[720px]',
    );
    expect(container.querySelector('.panel-content')).toHaveClass(
      'md:!max-h-[calc(100dvh-5rem)]',
    );
  });

  it('renders the learning-method sections in order with advanced features last', () => {
    render(<LearningSettingsPanel {...baseProps} />);

    const labels = [
      /^tutoring$/i,
      /^memory hooks$/i,
      /^study notes$/i,
      /^how to reveal words$/i,
      /^quizzes$/i,
      /^advanced features$/i,
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

  it('visually separates the advanced features section', () => {
    render(<LearningSettingsPanel {...baseProps} />);
    const advancedWrap = screen.getByText(/^advanced features$/i).closest('.border-dashed');
    expect(advancedWrap).not.toBeNull();
  });

  it('does not render general app sections (kept in Settings)', () => {
    render(<LearningSettingsPanel {...baseProps} />);
    expect(screen.queryByText(/local data & sync/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^account$/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-language-picker')).not.toBeInTheDocument();
    expect(screen.queryByText(/interface language/i)).not.toBeInTheDocument();
  });

  it('lists every repetition level with the exercises it uses', () => {
    render(<LearningSettingsPanel {...baseProps} />);
    // The overview names the levels, not the individual variants: the detail
    // only appears once a level is opened.
    expect(screen.getByRole('button', { name: /new \/ forgotten/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /60 days/i })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /see the foreign word/i })).not.toBeInTheDocument();
  });

  it('offers only Default and Custom, starting on Default', () => {
    render(<LearningSettingsPanel {...baseProps} />);
    expect(screen.getAllByRole('radio', { name: /^(default|custom)$/i })).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /^default$/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.queryByRole('radio', { name: /^(gentle|demanding)$/i })).not.toBeInTheDocument();
  });

  it('opens a level to reveal its exercises, with typing options under Advanced', async () => {
    const user = userEvent.setup();
    render(<LearningSettingsPanel {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /3 days/i }));

    expect(screen.getByRole('checkbox', { name: /see your own language/i })).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: /50% shown, hints up to 90%/i }),
    ).toBeInTheDocument();
    // Matching is configurable here but says plainly that it is practice only.
    expect(
      screen.getByText(/matching never changes when a word comes back/i),
    ).toBeInTheDocument();

    // The mechanical typing switches moved under Advanced.
    expect(
      screen.queryByRole('switch', { name: /prefill commas, periods and spaces/i }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^advanced$/i }));
    expect(
      screen.getByRole('switch', { name: /prefill commas, periods and spaces/i }),
    ).toBeInTheDocument();
  });
});
