import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
