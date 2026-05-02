import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LearningLanguageOnboarding } from '../LearningLanguageOnboarding';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('LearningLanguageOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/languages') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              languages: [
                { code: 'en', name: 'English', ttsAvailable: true, preferredVoice: null },
                { code: 'cs', name: 'Czech', ttsAvailable: true, preferredVoice: null },
              ],
            }),
          } as Response);
        }
        if (url.startsWith('/api/lists/matches')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ lists: [] }),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );
  });

  it('starts with the target learning language unselected', async () => {
    render(
      <LearningLanguageOnboarding
        onComplete={vi.fn()}
        onSelectList={vi.fn()}
      />,
    );

    expect(screen.getByText('Select a language')).toBeInTheDocument();
    expect(screen.getByText('Choose both languages to find matching word lists.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Autogenerate common list/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/languages');
    });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).startsWith('/api/lists/matches'))).toBe(false);
  });

  it('loads matching lists after the target language is selected', async () => {
    render(
      <LearningLanguageOnboarding
        onComplete={vi.fn()}
        onSelectList={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByRole('searchbox', { name: /I want to learn language/i }));
    fireEvent.click(await screen.findByRole('option', { name: /Czech/i }));

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([url]) => (
        String(url).startsWith('/api/lists/matches?from=en&to=cs')
      ))).toBe(true);
    });
  });
});
