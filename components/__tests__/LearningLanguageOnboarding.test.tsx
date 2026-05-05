import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  estimateCommonListGenerationSeconds,
  formatDurationEstimate,
  LearningLanguageOnboarding,
} from '../LearningLanguageOnboarding';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  syncUserData: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock('@/lib/sync', () => ({
  syncUserData: (...args: unknown[]) => mocks.syncUserData(...args),
}));

function jsonResponse(data: unknown, init: Partial<Response> = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  } as Response);
}

describe('LearningLanguageOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncUserData.mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/languages') {
          return jsonResponse({
            languages: [
              { code: 'en', name: 'English', ttsAvailable: true, preferredVoice: null },
              { code: 'cs', name: 'Czech', ttsAvailable: true, preferredVoice: null },
            ],
          });
        }
        if (url.startsWith('/api/lists/matches')) {
          return jsonResponse({ lists: [] });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );
  });

  it('estimates common list generation time from items, clips, and characters', () => {
    const estimate = estimateCommonListGenerationSeconds({
      itemCount: 40,
      audioClipCount: 80,
      audioCharacterCount: 2400,
    });

    expect(estimate).toBeGreaterThan(60);
    expect(formatDurationEstimate(estimate)).toMatch(/about \d+ min/);
    expect(formatDurationEstimate(24)).toBe('about 24 sec');
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

  it('autogenerates a common list behind a loader and navigates straight to the list editor with quota notice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/languages') {
          return jsonResponse({
            languages: [
              { code: 'en', name: 'English', ttsAvailable: true, preferredVoice: null },
              { code: 'cs', name: 'Czech', ttsAvailable: true, preferredVoice: null },
            ],
          });
        }
        if (url.startsWith('/api/lists/matches')) {
          return jsonResponse({ lists: [] });
        }
        if (url === '/api/lists') {
          return jsonResponse({
            lists: [
              {
                id: 'seed-list',
                ownerId: null,
                name: 'Common seed',
                description: null,
                languageFrom: 'en',
                languageTo: 'cs',
                isPublic: true,
                isCommon: true,
              },
            ],
          });
        }
        if (url === '/api/lists/seed-list?include_media=false') {
          return jsonResponse({
            items: [
              {
                id: 'seed-item',
                textKnown: 'hello',
                textTarget: 'ahoj',
                audioStatus: 'none',
                knownAudioStatus: 'none',
              },
            ],
          });
        }
        if (url === '/api/lists/seed-list/fork' && init?.method === 'POST') {
          return jsonResponse({
            list: {
              id: 'forked-list',
              ownerId: 'user-1',
              name: 'Common EN -> CS',
              description: null,
              languageFrom: 'en',
              languageTo: 'cs',
              isPublic: false,
            },
          }, { status: 201 });
        }
        if (url === '/api/lists/forked-list?include_media=false') {
          return jsonResponse({
            items: [
              {
                id: 'forked-1',
                textKnown: 'hello',
                textTarget: 'ahoj',
                audioStatus: 'none',
                knownAudioStatus: 'none',
              },
            ],
          });
        }
        if (url === '/api/google-usage') {
          return jsonResponse({
            account: [
              {
                scope: 'tts',
                account_limit: 6,
                used_units: 2,
                free_monthly_units: 6,
                request_count: 1,
                paused: false,
              },
            ],
          });
        }
        if (url === '/api/audio/generate/batch' && init?.method === 'POST') {
          return jsonResponse({
            results: [{ id: 'forked-1', status: 'error' }],
            generated_count: 0,
            quota_limit: {
              message: 'Only part of the list can be generated now. Contact us and we can help finish the list.',
            },
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );
    const onComplete = vi.fn();
    const onSelectList = vi.fn();

    render(
      <LearningLanguageOnboarding
        initialFrom="en"
        initialTo="cs"
        onComplete={onComplete}
        onSelectList={onSelectList}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Autogenerate common list/i }));

    expect(await screen.findByText('Preparing common list')).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('/lists?selected=forked-list'));
    });
    expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('audioNotice='));
    expect(onComplete).not.toHaveBeenCalled();
    expect(mocks.syncUserData).toHaveBeenCalledWith({
      language_from: 'en',
      language_to: 'cs',
      onboarding_completed: true,
    });
    expect(onSelectList).toHaveBeenCalledWith('forked-list');
  });
});
