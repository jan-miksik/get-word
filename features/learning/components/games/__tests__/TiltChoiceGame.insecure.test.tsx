import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { NormalizedWord } from '@/lib/words';
import { TiltChoiceGame } from '../TiltChoiceGame';

// The hook's own suite covers insecure-origin detection; here the hook is
// mocked so the UI test only checks that the HTTPS hint renders.
vi.mock('@/features/learning/hooks/useDeviceTilt', () => ({
  useDeviceTilt: () => ({
    tilt: null,
    support: 'insecure' as const,
    requestPermission: vi.fn(async () => false),
  }),
}));

const WORDS: NormalizedWord[] = [
  { id: 'a', cz: 'pes', vi: 'con chó', en: '', category: ['word'] },
  { id: 'b', cz: 'kočka', vi: 'con mèo', en: '', category: ['word'] },
];

describe('TiltChoiceGame on an insecure origin', () => {
  it('shows the HTTPS hint instead of the enable-tilt button', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    render(<TiltChoiceGame words={WORDS} role="knownLanguage" sourceLang="from" />);

    expect(
      screen.getByText('Tilt controls require a secure connection (HTTPS)'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Enable tilt')).not.toBeInTheDocument();
  });
});
