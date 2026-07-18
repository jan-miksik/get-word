import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WordCard } from '../WordCard';
import { STAGES, type NormalizedWord } from '@/lib/words';

const word: NormalizedWord = {
  id: 'test-1',
  cz: 'pes',
  vi: 'con chó',
  en: 'dog',
  category: ['animal'],
};

const baseProps = {
  word,
  progress: { stageIndex: 1, knownCount: 0, unknownCount: 0, nextDueAt: undefined },
  role: 'knownLanguage' as const,
  modeIndex: 0,
  showAll: true,
  memoryHook: '',
  suggestedHook: '',
  onKnown: vi.fn(),
  onUnknown: vi.fn(),
  onMemoryHookChange: vi.fn(),
};

describe('WordCard fullscreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders without fullscreen prop normally', () => {
    render(<WordCard {...baseProps} />);
    expect(screen.getByText('pes')).toBeInTheDocument();
  });

  it('applies fullscreen class when fullscreen prop is true', () => {
    const { container } = render(<WordCard {...baseProps} fullscreen />);
    expect(container.firstChild).toHaveClass('word-card--fullscreen');
  });

  it('shows the empty memory hook row in fullscreen mode so a new hook can be added', () => {
    render(<WordCard {...baseProps} fullscreen />);

    expect(screen.getByText('💭 Add memory hook...')).toBeInTheDocument();
  });

  it('does not render the old stage time badge', () => {
    const { container } = render(<WordCard {...baseProps} fullscreen />);

    expect(container.querySelector('.card-time-badge')).toBeNull();
  });

  it('shows a scratch-to-reveal hint by default when a language is covered', () => {
    render(
      <WordCard
        {...baseProps}
        progress={{ stageIndex: 1, knownCount: 1, unknownCount: 0 }}
        showAll={false}
        fullscreen
      />
    );

    const coveredRow = document.querySelector('[data-lang="vi"]');
    expect(coveredRow).toHaveClass('is-scratch');
    expect(coveredRow?.querySelector('.scratch-cover')).not.toBeNull();
  });

  it('starts editing when the empty fullscreen memory hook is tapped', () => {
    render(<WordCard {...baseProps} fullscreen />);

    fireEvent.click(screen.getByText('💭 Add memory hook...'));

    expect(screen.getByPlaceholderText('Enter memory hook...')).toBeVisible();
  });

  it('starts editing an existing memory hook with a quick double tap at mobile width', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    render(<WordCard {...baseProps} memoryHook="existing hook" fullscreen />);

    const nowSpy = vi.spyOn(Date, 'now');
    const hookInput = screen.getByPlaceholderText('Enter memory hook...');

    nowSpy.mockReturnValue(1_000);
    fireEvent.click(screen.getByText('existing hook'));
    expect(hookInput).not.toHaveFocus();

    // A second tap arriving too late counts as a fresh first tap.
    nowSpy.mockReturnValue(2_000);
    fireEvent.click(screen.getByText('existing hook'));
    expect(hookInput).not.toHaveFocus();

    nowSpy.mockReturnValue(2_200);
    fireEvent.click(screen.getByText('existing hook'));
    expect(hookInput).toHaveFocus();
    nowSpy.mockRestore();
  });

  it('does not show the speaker button when stored audio is missing', () => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: { cancel: vi.fn(), speak: vi.fn() },
      configurable: true,
    });

    render(<WordCard {...baseProps} fullscreen />);

    expect(screen.queryByTitle('Play Vietnamese audio')).not.toBeInTheDocument();
  });

  it('renders the renamed SRS controls and preserves their click handlers', () => {
    const onUnknown = vi.fn();
    const onKnown = vi.fn();
    const onCustomStage = vi.fn();

    render(
      <WordCard
        {...baseProps}
        onUnknown={onUnknown}
        onKnown={onKnown}
        onCustomStage={onCustomStage}
        fullscreen
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /don't know/i }));
    fireEvent.click(screen.getByRole('button', { name: /^i know/i }));
    fireEvent.click(screen.getByRole('button', { name: /custom interval/i }));
    fireEvent.click(screen.getByRole('option', { name: /fully known/i }));

    expect(onUnknown).toHaveBeenCalledTimes(1);
    expect(onKnown).toHaveBeenCalledTimes(1);
    expect(onCustomStage).toHaveBeenCalledWith(STAGES.length - 1, { noRepeat: true });
  });

  it('keeps the legacy fully-known handler working when no custom stage handler is provided', () => {
    const onReallyKnown = vi.fn();

    render(
      <WordCard
        {...baseProps}
        onReallyKnown={onReallyKnown}
        fullscreen
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /custom interval/i }));
    fireEvent.click(screen.getByRole('option', { name: /fully known/i }));

    expect(onReallyKnown).toHaveBeenCalledTimes(1);
  });

  it('marks the action row for custom-only mobile layout when requested', () => {
    const { container } = render(
      <WordCard
        {...baseProps}
        onCustomStage={vi.fn()}
        mobileCustomActionOnly
        fullscreen
      />
    );

    expect(container.querySelector('.card-actions-row')).toHaveClass(
      'card-actions-row--mobile-custom-only'
    );
    expect(screen.getByRole('button', { name: /custom interval/i })).toBeInTheDocument();
  });

  it('starts stored audio synchronously from the larger floating audio button', () => {
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    const audioConstructor = vi.fn();
    class AudioMock {
      currentTime = 0;
      play = play;
      pause = pause;

      constructor(src: string) {
        audioConstructor(src);
      }
    }
    vi.stubGlobal('Audio', AudioMock);

    render(
      <WordCard
        {...baseProps}
        word={{ ...word, viAudio: 'speech/vi/dog.mp3' }}
        fullscreen
      />
    );

    const button = screen.getByRole('button', { name: /play audio/i });
    expect(button).toHaveClass('!h-16');

    fireEvent.click(button);
    expect(audioConstructor).toHaveBeenCalledWith('/speech/vi/dog.mp3');
    expect(play).toHaveBeenCalledTimes(1);
  });
});
