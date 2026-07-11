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

// The list-setup options (autogenerate / fork / create-own / existing matches)
// live behind the "Advanced options" toggle and are aria-hidden until expanded.
async function openAdvanced() {
  fireEvent.click(await screen.findByRole('button', { name: 'Advanced options' }));
}

describe('LearningLanguageOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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

    // Paced under the rate cap (~27s for 80 clips) plus light overhead, not the
    // older doubled batch+serial-upload estimate.
    expect(estimate).toBe(51);
    expect(formatDurationEstimate(estimate)).toBe('about 51 sec');
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
    // A fresh onboarding user has no target language yet, so the primary Continue
    // button stays collapsed and out of the a11y tree until both languages are
    // chosen; the advanced list-setup options are likewise hidden.
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Choose from existing word lists, create your own, or fork a list and customize it to fit what you want to learn.',
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Automatically generate a list of words and phrases/i })).not.toBeInTheDocument();

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

  it('disables the selected known language in the target language picker', async () => {
    render(
      <LearningLanguageOnboarding
        initialFrom="en"
        onComplete={vi.fn()}
        onSelectList={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByRole('combobox', { name: /I want to learn language/i }));

    expect(await screen.findByRole('option', { name: /English/i })).toBeDisabled();
  });

  it('disables the streamlined continue action when loading matching lists fails', async () => {
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
          return Promise.reject(new Error('network down'));
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

    expect(await screen.findByRole('button', { name: /^Continue$/i })).toBeDisabled();
    expect(await screen.findByText('Could not load lists')).toBeInTheDocument();
  });

  it('continues by subscribing to the recommended list before completing onboarding', async () => {
    const recommendedList = {
      id: 'recommended-en-vi',
      ownerId: null,
      name: 'Recommended English Vietnamese',
      description: 'Starter list',
      languageFrom: 'en',
      languageTo: 'vi',
      isPublic: true,
      isCommon: true,
      isRecommended: true,
      itemCount: 100,
    };
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const onSelectList = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
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
        return jsonResponse({
          lists: [recommendedList],
          recommendedList,
          recommendedReason: 'exact',
        });
      }
      if (url === '/api/lists/recommended-en-vi/subscribe') {
        return jsonResponse({ subscribed: true }, { status: 201 });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <LearningLanguageOnboarding
        initialFrom="en"
        initialTo="vi"
        onComplete={onComplete}
        onSelectList={onSelectList}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/lists/matches?from=en&to=vi',
        expect.any(Object),
      );
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('en', 'vi');
    });
    expect(onSelectList).toHaveBeenCalledWith('recommended-en-vi');
    const subscribeCall = fetchMock.mock.calls.findIndex(
      ([url]) => String(url) === '/api/lists/recommended-en-vi/subscribe',
    );
    expect(subscribeCall).toBeGreaterThanOrEqual(0);
    expect(fetchMock.mock.invocationCallOrder[subscribeCall]).toBeLessThan(
      onComplete.mock.invocationCallOrder[0],
    );
  });

  it('opens directly to list choices when no list is selected', async () => {
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
          return jsonResponse({
            lists: [
              {
                id: 'public-en-vi',
                ownerId: null,
                name: 'Public English Vietnamese',
                description: 'Ready to learn',
                languageFrom: 'en',
                languageTo: 'vi',
                isPublic: true,
                isCommon: true,
                itemCount: 80,
              },
            ],
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    render(
      <LearningLanguageOnboarding
        initialFrom="en"
        initialTo="vi"
        reason="noListSelected"
        onComplete={vi.fn()}
        onSelectList={vi.fn()}
      />,
    );

    expect(await screen.findByText('Public English Vietnamese')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hide advanced options/i })).toBeInTheDocument();
  });

  it('opens advanced options when the landing flow requests a custom list', async () => {
    render(
      <LearningLanguageOnboarding
        initialFrom="en"
        initialTo="cs"
        reason="customList"
        onComplete={vi.fn()}
        onSelectList={vi.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: /Hide advanced options/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create own list/i })).toBeInTheDocument();
  });

  it('keeps create-own available and hides autogenerate when a recommendation exists', async () => {
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
    await openAdvanced();
    expect(screen.getByRole('button', { name: /Create own list/i })).toBeInTheDocument();
    expect(screen.getByText('recommended')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Automatically generate a list of words and phrases/i })).not.toBeInTheDocument();
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
            id: 'common-vi-cs',
            ownerId: null,
            name: 'Common Vietnamese Czech',
            description: 'Common starter list',
            languageFrom: 'vi',
            languageTo: 'cs',
            isPublic: true,
            isCommon: true,
            isRecommended: true,
            itemCount: 120,
          };
          return jsonResponse({
            lists: [commonList],
            recommendedList: commonList,
            recommendedReason: 'exact',
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

    expect(await screen.findByText('Common Vietnamese Czech')).toBeInTheDocument();
    await openAdvanced();
    expect(screen.getByText('recommended')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create own list/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Automatically generate a list of words and phrases/i })).not.toBeInTheDocument();
  });

  it('autogenerates a shared reversed list for a reverse-direction recommendation', async () => {
    const reverseList = {
      id: 'common-cs-vi',
      ownerId: null,
      name: 'Common Czech Vietnamese',
      description: 'Common starter list',
      // Source list is Czech→Vietnamese; the user wants the opposite direction.
      languageFrom: 'cs',
      languageTo: 'vi',
      isPublic: true,
      isCommon: true,
      isRecommended: true,
      itemCount: 120,
    };
    const generatedList = {
      ...reverseList,
      id: 'generated-vi-cs',
      name: 'Vietnamese - Czech',
      languageFrom: 'vi',
      languageTo: 'cs',
      isAutogenerated: true,
    };
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const onSelectList = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
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
        return jsonResponse({
          lists: [reverseList],
          recommendedList: reverseList,
          recommendedReason: 'reverse',
        });
      }
      if (url === '/api/lists/autogenerate-common' && init?.method === 'POST') {
        const payload = JSON.parse(String(init?.body ?? '{}'));
        expect(payload.language_from).toBe('vi');
        expect(payload.language_to).toBe('cs');
        return jsonResponse({
          list: generatedList,
          item_count: 1,
          provider: 'seed_copy',
          seed_kind: 'reverse_pair',
          seed_list_id: 'common-cs-vi',
          reused_existing: false,
          translation_stats: { reused: 1, generated: 0 },
        });
      }
      if (url === '/api/lists/generated-vi-cs') {
        return jsonResponse({
          items: [
            {
              id: 'generated-item',
              textKnown: 'xin chào',
              textTarget: 'ahoj',
              knownAudioStatus: 'ready',
              knownAudioUrl: '/api/audio/known',
              knownAudioArweaveUrls: [],
              audioStatus: 'ready',
              audioUrl: '/api/audio/target',
              audioArweaveUrls: [],
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
              used_units: 0,
              free_monthly_units: 6,
              request_count: 0,
              paused: false,
            },
          ],
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <LearningLanguageOnboarding
        initialFrom="vi"
        initialTo="cs"
        onComplete={onComplete}
        onSelectList={onSelectList}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/lists/matches?from=vi&to=cs',
        expect.any(Object),
      );
    });
    // The reverse-direction source list must never appear as a selectable card;
    // it is offered only via the "flip into your direction" autogenerate action.
    expect(screen.queryByText('Common Czech Vietnamese')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('vi', 'cs');
    });
    expect(onSelectList).toHaveBeenCalledWith('generated-vi-cs');
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/subscribe')),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/fork')),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url) === '/api/lists/autogenerate-common'),
    ).toBe(true);
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
    await openAdvanced();
    expect(screen.getByText(/No exact selected list exists yet for English and Japanese/i)).toBeInTheDocument();
    expect(screen.getByText('seed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Fork$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Automatically generate a list of words and phrases/i })).not.toBeInTheDocument();
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
        if (url === '/api/lists/autogenerate-common' && init?.method === 'POST') {
          return jsonResponse({
            list: {
              id: 'generated-list',
              ownerId: 'editor-1',
              name: 'Common EN -> CS',
              description: null,
              languageFrom: 'en',
              languageTo: 'cs',
              isPublic: true,
              isRecommended: true,
              isAutogenerated: true,
            },
            item_count: 1,
            provider: 'openrouter',
            seed_kind: 'translation_base',
            seed_list_id: 'seed-list',
            reused_existing: false,
          });
        }
        if (url === '/api/lists/generated-list') {
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

    expect(await screen.findByText('1 word will be generated.')).toBeInTheDocument();
    await openAdvanced();
    fireEvent.click(await screen.findByRole('button', { name: /Automatically generate a list of words and phrases/i }));

    expect(await screen.findByText('Preparing common list')).toBeInTheDocument();
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('en', 'cs');
    });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.syncUserData).toHaveBeenCalledWith({
      language_from: 'en',
      language_to: 'cs',
      onboarding_completed: true,
    });
    expect(onSelectList).toHaveBeenCalledWith('generated-list');
  });

  it('opens the app and marks the list when common list audio generation fails', async () => {
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
        if (url === '/api/lists/autogenerate-common' && init?.method === 'POST') {
          return jsonResponse({
            list: {
              id: 'generated-list',
              ownerId: 'editor-1',
              name: 'Common EN / CS',
              description: null,
              languageFrom: 'en',
              languageTo: 'cs',
              isPublic: true,
              isRecommended: true,
              isAutogenerated: true,
            },
            item_count: 1,
            provider: 'openrouter',
            seed_kind: 'translation_base',
            seed_list_id: 'seed-list',
            reused_existing: false,
          });
        }
        if (url === '/api/lists/generated-list') {
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

    await openAdvanced();
    fireEvent.click(await screen.findByRole('button', { name: /Automatically generate a list of words and phrases/i }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('en', 'cs');
    });
    expect(mocks.push).not.toHaveBeenCalled();
    const pendingAudio = JSON.parse(
      localStorage.getItem('get-word-pending-common-list-audio') ?? '{}',
    ) as { listId?: string; notice?: string };
    expect(pendingAudio.listId).toBe('generated-list');
    expect(pendingAudio.notice).toContain('Audio setup was interrupted');
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
        if (url === '/api/lists/autogenerate-common' && init?.method === 'POST') {
          return jsonResponse({
            list: {
              id: 'generated-list',
              ownerId: 'editor-1',
              name: 'Common CS / FR',
              description: null,
              languageFrom: 'cs',
              languageTo: 'fr',
              isPublic: true,
              isRecommended: true,
              isAutogenerated: true,
            },
            item_count: 1,
            provider: 'openrouter',
            seed_kind: 'translation_base',
            seed_list_id: 'overlap-public',
            reused_existing: false,
          });
        }
        if (url === '/api/lists/generated-list') {
          return jsonResponse({
            items: [
              {
                id: 'forked-1',
                textKnown: 'ahoj',
                textTarget: 'salut',
                audioStatus: 'ready',
                audioUrl: '/api/audio/target-ready',
                audioArweaveUrls: [],
                knownAudioStatus: 'ready',
                knownAudioUrl: '/api/audio/known-ready',
                knownAudioArweaveUrls: [],
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

    await openAdvanced();
    fireEvent.click(await screen.findByRole('button', { name: /Automatically generate a list of words and phrases/i }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/lists/overlap-public?include_media=false');
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/lists/autogenerate-common',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('requests server autogeneration when no reusable seed is available', async () => {
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
        if (url === '/api/lists/autogenerate-common' && init?.method === 'POST') {
          return jsonResponse({
            list: {
              id: 'new-generated-list',
              ownerId: 'editor-1',
              name: 'Common CS / FR',
              description: 'Autogenerated with Claude Sonnet 4.6 via OpenRouter.',
              languageFrom: 'cs',
              languageTo: 'fr',
              isPublic: true,
              isRecommended: true,
              isAutogenerated: true,
            },
            item_count: 1,
            provider: 'openrouter',
            seed_kind: 'llm_generated',
            seed_list_id: null,
            reused_existing: false,
          });
        }
        if (url === '/api/lists/new-generated-list') {
          return jsonResponse({
            items: [
              {
                id: 'generated-1',
                textKnown: 'ahoj',
                textTarget: 'salut',
                audioStatus: 'ready',
                audioUrl: '/api/audio/target-ready',
                audioArweaveUrls: [],
                knownAudioStatus: 'ready',
                knownAudioUrl: '/api/audio/known-ready',
                knownAudioArweaveUrls: [],
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

    const onSelectList = vi.fn();
    render(
      <LearningLanguageOnboarding
        initialFrom="cs"
        initialTo="fr"
        onComplete={vi.fn()}
        onSelectList={onSelectList}
      />,
    );

    await openAdvanced();
    fireEvent.click(await screen.findByRole('button', { name: /Automatically generate a list of words and phrases/i }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/lists/autogenerate-common',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(onSelectList).toHaveBeenCalledWith('new-generated-list');
  });

  it('shows inline guidance when common list generation fails', async () => {
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
        if (url === '/api/lists/autogenerate-common' && init?.method === 'POST') {
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

    await openAdvanced();
    fireEvent.click(await screen.findByRole('button', { name: /Automatically generate a list of words and phrases/i }));

    await waitFor(() => {
      expect(screen.getByText(/Translation failed/i)).toBeInTheDocument();
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
