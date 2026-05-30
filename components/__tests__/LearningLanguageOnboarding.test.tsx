import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  estimateCommonListGenerationSeconds,
  formatDurationEstimate,
  LearningLanguageOnboarding,
  pickAutogenerateCommonSeed,
  sortMatchedWordLists,
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

  it('prefers the admin-marked common seed over exact public language matches', () => {
    const seed = pickAutogenerateCommonSeed([
      {
        id: 'exact-public',
        ownerId: null,
        name: 'Czech French public',
        description: null,
        languageFrom: 'cs',
        languageTo: 'fr',
        isPublic: true,
        isCommon: false,
      },
      {
        id: 'testing',
        ownerId: null,
        name: 'testing',
        description: null,
        languageFrom: 'en',
        languageTo: 'vi',
        isPublic: true,
        isCommon: false,
      },
      {
        id: 'admin-seed',
        ownerId: 'editor-1',
        name: 'Common seed source',
        description: null,
        languageFrom: 'en',
        languageTo: 'vi',
        isPublic: true,
        isCommon: true,
      },
    ], 'cs', 'fr');

    expect(seed?.id).toBe('admin-seed');
  });

  it('uses the most recently updated common seed when old data has more than one', () => {
    const seed = pickAutogenerateCommonSeed([
      {
        id: 'old-default-common',
        ownerId: null,
        name: 'Common Czech Vietnamese',
        description: null,
        languageFrom: 'cz',
        languageTo: 'vi',
        isPublic: true,
        isCommon: true,
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'new-admin-seed',
        ownerId: 'editor-1',
        name: 'Admin selected common seed',
        description: null,
        languageFrom: 'en',
        languageTo: 'vi',
        isPublic: true,
        isCommon: true,
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ], 'cs', 'vi');

    expect(seed?.id).toBe('new-admin-seed');
  });

  it('ignores private non-common lists as autogenerate seeds', () => {
    const seed = pickAutogenerateCommonSeed([
      {
        id: 'private-user-list',
        ownerId: 'user-1',
        name: 'My private list',
        description: null,
        languageFrom: 'cs',
        languageTo: 'fr',
        isPublic: false,
        isCommon: false,
      },
    ], 'cs', 'fr');

    expect(seed).toBeNull();
  });

  it('sorts the general common seed first for matching lists', () => {
    const sorted = sortMatchedWordLists([
      {
        id: 'personal',
        ownerId: 'user-1',
        name: 'My Czech Vietnamese',
        description: null,
        languageFrom: 'cs',
        languageTo: 'vi',
        isPublic: false,
        isCommon: false,
        isOwner: true,
        itemCount: 20,
      },
      {
        id: 'general-common-cz',
        ownerId: null,
        name: 'General common list - CZ based',
        description: null,
        languageFrom: 'cz',
        languageTo: 'vi',
        isPublic: true,
        isCommon: true,
        itemCount: 120,
      },
      {
        id: 'curated',
        ownerId: null,
        name: 'Curated Czech Vietnamese',
        description: null,
        languageFrom: 'cs',
        languageTo: 'vi',
        isPublic: true,
        isCommon: false,
        itemCount: 200,
      },
    ], 'vi', 'cs');

    expect(sorted.map((list) => list.id)).toEqual([
      'general-common-cz',
      'curated',
      'personal',
    ]);
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
    expect(
      screen.queryByText(
        'Choose from existing word lists, create your own, or fork a list and customize it to fit what you want to learn.',
      ),
    ).not.toBeInTheDocument();
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

    fireEvent.focus(screen.getByRole('combobox', { name: /I want to learn language/i }));
    fireEvent.click(await screen.findByRole('option', { name: /Czech/i }));

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([url]) => (
        String(url).startsWith('/api/lists/matches?from=en&to=cs')
      ))).toBe(true);
    });
  });

  it('keeps create-own available when lists exist and offers autogenerate only without a common list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/languages') {
          return jsonResponse({
            languages: [
              { code: 'cs', name: 'Czech', ttsAvailable: true, preferredVoice: null },
              { code: 'vi', name: 'Vietnamese', ttsAvailable: true, preferredVoice: null },
            ],
          });
        }
        if (url.startsWith('/api/lists/matches?from=cs&to=vi')) {
          const curatedList = {
            id: 'curated-cs-vi',
            ownerId: null,
            name: 'Curated Czech Vietnamese',
            description: 'Curated starter list',
            languageFrom: 'cz',
            languageTo: 'vi',
            isPublic: true,
            isCommon: false,
            isRecommended: true,
            itemCount: 88,
          };
          return jsonResponse({
            lists: [curatedList],
            recommendedList: curatedList,
            recommendedReason: 'exact',
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    render(
      <LearningLanguageOnboarding
        initialFrom="cs"
        initialTo="vi"
        onComplete={vi.fn()}
        onSelectList={vi.fn()}
      />,
    );

    expect(await screen.findByText('Curated Czech Vietnamese')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create own list/i })).toBeInTheDocument();
    expect(screen.getByText('recommended')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Autogenerate common list/i })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Choose from existing word lists, create your own, or fork a list and customize it to fit what you want to learn.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Existing Czech and Vietnamese lists')).toBeInTheDocument();
    expect(screen.queryByText(/Czech → Vietnamese/)).not.toBeInTheDocument();
  });

  it('does not offer autogenerate when a common list already matches the languages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/languages') {
          return jsonResponse({
            languages: [
              { code: 'cs', name: 'Czech', ttsAvailable: true, preferredVoice: null },
              { code: 'vi', name: 'Vietnamese', ttsAvailable: true, preferredVoice: null },
            ],
          });
        }
        if (url.startsWith('/api/lists/matches?from=vi&to=cs')) {
          const commonList = {
            id: 'common-cs-vi',
            ownerId: null,
            name: 'Common Czech Vietnamese',
            description: 'Common starter list',
            languageFrom: 'cz',
            languageTo: 'vi',
            isPublic: true,
            isCommon: true,
            isRecommended: true,
            itemCount: 120,
          };
          return jsonResponse({
            lists: [commonList],
            recommendedList: commonList,
            recommendedReason: 'reverse',
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    render(
      <LearningLanguageOnboarding
        initialFrom="vi"
        initialTo="cs"
        onComplete={vi.fn()}
        onSelectList={vi.fn()}
      />,
    );

    expect(await screen.findByText('Common Czech Vietnamese')).toBeInTheDocument();
    expect(screen.getByText('recommended')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create own list/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Autogenerate common list/i })).not.toBeInTheDocument();
  });

  it('shows only the no-matches message when no lists exist for the selected languages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/languages') {
          return jsonResponse({
            languages: [
              { code: 'en', name: 'English', ttsAvailable: true, preferredVoice: null },
              { code: 'vi', name: 'Vietnamese', ttsAvailable: true, preferredVoice: null },
            ],
          });
        }
        if (url.startsWith('/api/lists/matches?from=en&to=vi')) {
          return jsonResponse({ lists: [] });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    render(
      <LearningLanguageOnboarding
        initialFrom="en"
        initialTo="vi"
        onComplete={vi.fn()}
        onSelectList={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(
        'No matching lists yet for English and Vietnamese. You can generate a common list from the best available seed, browse other lists, or start your own.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Choose from existing word lists, create your own, or fork a list and customize it to fit what you want to learn.',
      ),
    ).not.toBeInTheDocument();
  });

  it('shows a forkable basic seed when the server falls back from selected lists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/languages') {
          return jsonResponse({
            languages: [
              { code: 'en', name: 'English', ttsAvailable: true, preferredVoice: null },
              { code: 'ja', name: 'Japanese', ttsAvailable: true, preferredVoice: null },
            ],
          });
        }
        if (url.startsWith('/api/lists/matches?from=en&to=ja')) {
          return jsonResponse({
            lists: [],
            recommendedList: {
              id: 'basic-seed',
              ownerId: null,
              name: 'Basic Seed',
              description: 'Starter seed',
              languageFrom: 'cs',
              languageTo: 'vi',
              isPublic: true,
              isCommon: true,
              isRecommended: false,
              itemCount: 100,
            },
            recommendedReason: 'fallback_seed',
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    render(
      <LearningLanguageOnboarding
        initialFrom="en"
        initialTo="ja"
        onComplete={vi.fn()}
        onSelectList={vi.fn()}
      />,
    );

    expect(await screen.findByText('Basic Seed')).toBeInTheDocument();
    expect(screen.getByText(/No exact selected list exists yet for English and Japanese/i)).toBeInTheDocument();
    expect(screen.getByText('seed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Fork$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Autogenerate common list/i })).not.toBeInTheDocument();
  });

  it('shows the generated word count, autogenerates a common list, and opens the app', async () => {
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
            results: [{ id: 'forked-1', status: 'ok', audio_url: '/api/audio/hash' }],
            generated_count: 1,
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

    expect(await screen.findByText('1 word will be generated from Common seed.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Autogenerate common list/i }));

    expect(await screen.findByText('Preparing common list')).toBeInTheDocument();
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('en', 'cs');
    });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.syncUserData).not.toHaveBeenCalled();
    expect(onSelectList).toHaveBeenCalledWith('forked-list');
  });

  it('redirects to the audio repair step when common list audio generation fails', async () => {
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
            items: [{ id: 'seed-item', textKnown: 'hello', textTarget: 'ahoj', audioStatus: 'none', knownAudioStatus: 'none' }],
          });
        }
        if (url === '/api/lists/seed-list/fork' && init?.method === 'POST') {
          return jsonResponse({
            list: {
              id: 'forked-list',
              ownerId: 'user-1',
              name: 'Common EN / CS',
              description: null,
              languageFrom: 'en',
              languageTo: 'cs',
              isPublic: false,
            },
          }, { status: 201 });
        }
        if (url === '/api/lists/forked-list?include_media=false') {
          return jsonResponse({
            items: [{ id: 'forked-1', textKnown: 'hello', textTarget: 'ahoj', audioStatus: 'none', knownAudioStatus: 'none' }],
          });
        }
        if (url === '/api/google-usage') {
          return jsonResponse({ account: [] });
        }
        if (url === '/api/audio/generate/batch' && init?.method === 'POST') {
          return jsonResponse({
            results: [{ id: 'forked-1', status: 'error', error: 'Google TTS request failed: API key not valid' }],
            generated_count: 0,
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    const onComplete = vi.fn();
    render(
      <LearningLanguageOnboarding
        initialFrom="en"
        initialTo="cs"
        onComplete={onComplete}
        onSelectList={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Autogenerate common list/i }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('/lists?'));
    });
    const targetUrl = new URL(mocks.push.mock.calls.at(-1)?.[0], 'http://localhost');
    expect(targetUrl.searchParams.get('selected')).toBe('forked-list');
    expect(targetUrl.searchParams.get('fixAudio')).toBe('target');
    expect(targetUrl.searchParams.get('commonListNotice')).toContain('audio generation failed for 2 of 2 clips');
    expect(targetUrl.searchParams.get('commonListNotice')).toContain('Contact our tech support');
    expect(targetUrl.searchParams.get('commonListNotice')).toContain('click on Edit words');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('uses the best overlapping reusable seed when autogenerating a common list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/languages') {
          return jsonResponse({
            languages: [
              { code: 'cs', name: 'Czech', ttsAvailable: true, preferredVoice: null },
              { code: 'fr', name: 'French', ttsAvailable: true, preferredVoice: null },
              { code: 'de', name: 'German', ttsAvailable: true, preferredVoice: null },
              { code: 'it', name: 'Italian', ttsAvailable: true, preferredVoice: null },
              { code: 'vi', name: 'Vietnamese', ttsAvailable: true, preferredVoice: null },
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
                id: 'unrelated-public',
                ownerId: null,
                name: 'German Italian',
                description: null,
                languageFrom: 'de',
                languageTo: 'it',
                isPublic: true,
                isCommon: false,
              },
              {
                id: 'overlap-public',
                ownerId: null,
                name: 'Czech Starter',
                description: null,
                languageFrom: 'cz',
                languageTo: 'vi',
                isPublic: true,
                isCommon: false,
              },
            ],
          });
        }
        if (url === '/api/lists/overlap-public?include_media=false') {
          return jsonResponse({
            items: [
              {
                id: 'seed-item',
                textKnown: 'ahoj',
                textTarget: 'xin chao',
                audioStatus: 'ready',
                knownAudioStatus: 'ready',
              },
            ],
          });
        }
        if (url === '/api/lists/overlap-public/fork' && init?.method === 'POST') {
          return jsonResponse({
            list: {
              id: 'forked-list',
              ownerId: 'user-1',
              name: 'Common CS / FR',
              description: null,
              languageFrom: 'cs',
              languageTo: 'fr',
              isPublic: false,
            },
          }, { status: 201 });
        }
        if (url === '/api/lists/forked-list?include_media=false') {
          return jsonResponse({
            items: [
              {
                id: 'forked-1',
                textKnown: 'ahoj',
                textTarget: 'salut',
                audioStatus: 'ready',
                knownAudioStatus: 'ready',
              },
            ],
          });
        }
        if (url === '/api/google-usage') {
          return jsonResponse({ account: [] });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    render(
      <LearningLanguageOnboarding
        initialFrom="cs"
        initialTo="fr"
        onComplete={vi.fn()}
        onSelectList={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Autogenerate common list/i }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/lists/overlap-public?include_media=false');
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/lists/overlap-public/fork',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('creates an empty list when no reusable seed is available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/languages') {
          return jsonResponse({
            languages: [
              { code: 'cs', name: 'Czech', ttsAvailable: true, preferredVoice: null },
              { code: 'fr', name: 'French', ttsAvailable: true, preferredVoice: null },
            ],
          });
        }
        if (url.startsWith('/api/lists/matches')) {
          return jsonResponse({ lists: [] });
        }
        if (url === '/api/lists' && !init?.method) {
          return jsonResponse({
            lists: [
              {
                id: 'private-user-list',
                ownerId: 'user-1',
                name: 'My private list',
                description: null,
                languageFrom: 'cs',
                languageTo: 'fr',
                isPublic: false,
                isCommon: false,
              },
            ],
          });
        }
        if (url === '/api/lists' && init?.method === 'POST') {
          return jsonResponse({
            list: {
              id: 'new-empty-list',
              ownerId: 'user-1',
              name: 'Common CS / FR',
              description: 'Autogenerated common list seed',
              languageFrom: 'cs',
              languageTo: 'fr',
              isPublic: false,
            },
          }, { status: 201 });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    const onSelectList = vi.fn();
    render(
      <LearningLanguageOnboarding
        initialFrom="cs"
        initialTo="fr"
        onComplete={vi.fn()}
        onSelectList={onSelectList}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Autogenerate common list/i }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/lists',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(onSelectList).toHaveBeenCalledWith('new-empty-list');
  });

  it('redirects to lists with manual guidance when common list generation fails', async () => {
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
            items: [{ id: 'seed-item', textKnown: 'hello', textTarget: 'ahoj' }],
          });
        }
        if (url === '/api/lists/seed-list/fork' && init?.method === 'POST') {
          return jsonResponse({ error: 'Translation failed' }, { ok: false, status: 500 });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    render(
      <LearningLanguageOnboarding
        initialFrom="en"
        initialTo="cs"
        onComplete={vi.fn()}
        onSelectList={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Autogenerate common list/i }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('/lists?'));
    });
    const targetUrl = new URL(mocks.push.mock.calls.at(-1)?.[0], 'http://localhost');
    expect(targetUrl.pathname).toBe('/lists');
    expect(targetUrl.searchParams.get('sourcePair')).toBe('any');
    expect(targetUrl.searchParams.get('targetFrom')).toBe('en');
    expect(targetUrl.searchParams.get('targetTo')).toBe('cs');
    expect(targetUrl.searchParams.get('commonListNotice')).toBe(
      'Translation failed. You can finish the failed part manually from the list editor by editing the list and filling in the missing parts.',
    );
  });
});
