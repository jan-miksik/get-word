import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WordCard } from '../WordCard';
import type { NormalizedWord } from '@/lib/words';

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
  role: 'cz' as const,
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

  it('shows a tap-to-reveal hint when a language is covered', () => {
    render(
      <WordCard
        {...baseProps}
        progress={{ stageIndex: 1, knownCount: 1, unknownCount: 0 }}
        showAll={false}
        fullscreen
      />
    );

    expect(screen.getByText('Tap to reveal')).toBeInTheDocument();
  });

  it('starts editing when the empty fullscreen memory hook is tapped', () => {
    render(<WordCard {...baseProps} fullscreen />);

    fireEvent.click(screen.getByText('💭 Add memory hook...'));

    expect(screen.getByPlaceholderText('Enter memory hook...')).toBeVisible();
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
    const onReallyKnown = vi.fn();

    render(
      <WordCard
        {...baseProps}
        onUnknown={onUnknown}
        onKnown={onKnown}
        onReallyKnown={onReallyKnown}
        fullscreen
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /forgotten/i }));
    fireEvent.click(screen.getByRole('button', { name: /^ok/i }));
    fireEvent.click(screen.getByRole('button', { name: /easy/i }));

    expect(onUnknown).toHaveBeenCalledTimes(1);
    expect(onKnown).toHaveBeenCalledTimes(1);
    expect(onReallyKnown).toHaveBeenCalledTimes(1);
  });

  it('plays stored audio from the larger floating audio button', () => {
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
