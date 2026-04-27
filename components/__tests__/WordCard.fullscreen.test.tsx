import { describe, it, expect, vi } from 'vitest';
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

  it('starts editing when the empty fullscreen memory hook is tapped', () => {
    render(<WordCard {...baseProps} fullscreen />);

    fireEvent.click(screen.getByText('💭 Add memory hook...'));

    expect(screen.getByPlaceholderText('Enter memory hook...')).toBeVisible();
  });

  it('shows the speaker button via speech fallback when stored audio is missing', () => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: { cancel: vi.fn(), speak: vi.fn() },
      configurable: true,
    });

    render(<WordCard {...baseProps} fullscreen />);

    expect(screen.getByTitle('Play Vietnamese audio')).toBeInTheDocument();
  });
});
