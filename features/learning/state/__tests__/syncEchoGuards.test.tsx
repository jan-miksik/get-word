import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnqueueOp = vi.fn<(input: unknown) => Promise<null>>(() => Promise.resolve(null));
const mockSyncUserData =
  vi.fn<(data: unknown) => Promise<SyncResponse | undefined>>(() => Promise.resolve(undefined));
const mockPostTabMessage = vi.fn<(message: unknown) => void>();
const mockSubscribeTabMessages = vi.fn<(listener: unknown) => () => void>(() => () => {});

vi.mock('@/lib/sync', () => ({
  syncUserData: (data: unknown) => mockSyncUserData(data),
  hasReceivedServerSnapshot: () => true,
}));

vi.mock('@/lib/local-first/enqueue', () => ({
  enqueueOp: (input: unknown) => mockEnqueueOp(input),
}));

vi.mock('@/lib/tab-sync', () => ({
  postTabMessage: (message: unknown) => mockPostTabMessage(message),
  subscribeTabMessages: (listener: unknown) => mockSubscribeTabMessages(listener),
}));

import { useCategoryFilter } from '../categoryFilter';
import { usePreferences } from '../preferences';
import type { SyncResponse } from '@/features/sync/types';
import type { NormalizedWord } from '@/lib/words';

const baseUser = {
  id: 'user-1',
  role: 'languageToLearn',
  show_english: true,
  show_category_badges: false,
  show_pronunciation: false,
  memory_hooks_enabled: true,
  memory_hooks_intro_answered: false,
  memory_hook_disable_from_stage: 5,
  settings_language: 'en',
  settings_language_selected_at: '2026-05-01T00:00:00.000Z',
  category_order: ['animals', 'travel'],
} as SyncResponse['user'];

const words = [
  {
    id: 'word-1',
    category: ['animals', 'word'],
    cz: 'pes',
    en: 'dog',
    vi: 'cho',
  },
  {
    id: 'word-2',
    category: ['travel', 'word'],
    cz: 'letiste',
    en: 'airport',
    vi: 'san bay',
  },
] as NormalizedWord[];

describe('server sync echo guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    delete process.env.NEXT_PUBLIC_GET_WORD_SIMULATE_FIRST_OPEN;
    mockSubscribeTabMessages.mockReturnValue(() => {});
    mockEnqueueOp.mockResolvedValue(null);
    mockSyncUserData.mockResolvedValue(undefined);
  });

  it('does not prefill punctuation and spaces by default, while preserving an explicit opt-in', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result, unmount } = renderHook(() =>
      usePreferences(false, isUpdatingFromServerRef)
    );

    expect(result.current.typingPrefillPunctuation).toBe(false);
    unmount();

    localStorage.setItem('get-word-typing-prefill-punctuation', 'true');
    const storedPreference = renderHook(() =>
      usePreferences(false, isUpdatingFromServerRef)
    );

    expect(storedPreference.result.current.typingPrefillPunctuation).toBe(true);
  });

  it('does not autofocus the mobile typing keyboard by default, while preserving an explicit opt-in', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result, unmount } = renderHook(() =>
      usePreferences(false, isUpdatingFromServerRef)
    );

    expect(result.current.typingMobileKeyboardAutoFocus).toBe(false);
    unmount();

    localStorage.setItem('get-word-typing-mobile-keyboard-autofocus', 'true');
    const storedPreference = renderHook(() =>
      usePreferences(false, isUpdatingFromServerRef)
    );

    expect(storedPreference.result.current.typingMobileKeyboardAutoFocus).toBe(true);
  });

  it('keeps post-check audio off by default, while preserving an explicit opt-in', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result, unmount } = renderHook(() =>
      usePreferences(false, isUpdatingFromServerRef)
    );

    expect(result.current.typingPlayAudioAfterCheck).toBe(false);
    unmount();

    localStorage.setItem('get-word-typing-play-audio-after-check', 'true');
    const storedPreference = renderHook(() =>
      usePreferences(false, isUpdatingFromServerRef)
    );

    expect(storedPreference.result.current.typingPlayAudioAfterCheck).toBe(true);
  });

  it('keeps the explicit check button off by default, while preserving an opt-in', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result, unmount } = renderHook(() =>
      usePreferences(false, isUpdatingFromServerRef)
    );

    expect(result.current.typingCheckButtonEnabled).toBe(false);
    unmount();

    localStorage.setItem('get-word-typing-check-button-enabled', 'true');
    const storedPreference = renderHook(() =>
      usePreferences(false, isUpdatingFromServerRef)
    );

    expect(storedPreference.result.current.typingCheckButtonEnabled).toBe(true);
  });

  it('does not re-sync unchanged server category order payloads', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result, rerender } = renderHook(
      ({ isHydrated }) => usePreferences(isHydrated, isUpdatingFromServerRef),
      { initialProps: { isHydrated: false } }
    );

    act(() => {
      result.current.applyServerPreferences(baseUser);
    });

    rerender({ isHydrated: true });
    mockEnqueueOp.mockClear();

    act(() => {
      result.current.applyServerPreferences({ ...baseUser, category_order: ['animals', 'travel'] });
    });

    rerender({ isHydrated: true });

    expect(mockEnqueueOp).not.toHaveBeenCalled();
  });

  it('syncs settings language changes and marks the selection time locally', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => usePreferences(true, isUpdatingFromServerRef));

    act(() => {
      result.current.setSettingsLanguage('de');
    });

    expect(result.current.settingsLanguage).toBe('de');
    expect(result.current.settingsLanguageSelectedAt).toEqual(expect.any(String));
    expect(mockPostTabMessage).toHaveBeenCalledWith({
      type: 'preferences_changed',
      patch: expect.objectContaining({ settingsLanguage: 'de' }),
    });
  });

  it('persists the memory hooks intro answer locally and across tabs', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => usePreferences(true, isUpdatingFromServerRef));

    act(() => {
      result.current.setMemoryHooksIntroAnswered(true);
    });

    expect(result.current.memoryHooksIntroAnswered).toBe(true);
    expect(mockPostTabMessage).toHaveBeenCalledWith({
      type: 'preferences_changed',
      patch: { memoryHooksIntroAnswered: true },
    });
  });

  it('persists learning language onboarding immediately', async () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => usePreferences(true, isUpdatingFromServerRef));

    await act(async () => {
      await result.current.setLearningLanguages('en', 'cs');
    });

    expect(result.current.learningLanguageFrom).toBe('en');
    expect(result.current.learningLanguageTo).toBe('cs');
    expect(result.current.onboardingCompletedAt).toEqual(expect.any(String));
    expect(mockSyncUserData).toHaveBeenCalledWith({
      language_from: 'en',
      language_to: 'cs',
      onboarding_completed: true,
    });
    expect(mockEnqueueOp).toHaveBeenCalledWith({
      entity: 'preference',
      opType: 'set_language_pair',
      payload: {
        values: {
          language_from: 'en',
          language_to: 'cs',
          onboarding_completed: true,
        },
      },
      legacyPayload: {
        language_from: 'en',
        language_to: 'cs',
        onboarding_completed: true,
      },
    });
    expect(mockEnqueueOp).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ field: 'onboarding_completed' }),
      })
    );
  });

  it('does not let an older focus snapshot roll back a confirmed language pair', async () => {
    mockSyncUserData.mockResolvedValueOnce({
      success: true,
      user: {
        id: 'user-1',
        language_from: 'cs',
        language_to: 'vi',
        onboarding_completed_at: '2026-07-28T12:00:00.000Z',
      },
    } as SyncResponse);
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => usePreferences(true, isUpdatingFromServerRef));

    await act(async () => {
      await result.current.setLearningLanguages('cs', 'vi');
    });

    act(() => {
      result.current.applyServerPreferences({
        ...baseUser,
        language_from: 'fr',
        language_to: 'es',
        onboarding_completed_at: '2026-07-27T12:00:00.000Z',
      });
    });

    expect(result.current.learningLanguageFrom).toBe('cs');
    expect(result.current.learningLanguageTo).toBe('vi');

    // A genuinely newer change from another device must still be accepted.
    act(() => {
      result.current.applyServerPreferences({
        ...baseUser,
        language_from: 'de',
        language_to: 'en',
        onboarding_completed_at: '2026-07-29T12:00:00.000Z',
      });
    });
    expect(result.current.learningLanguageFrom).toBe('de');
    expect(result.current.learningLanguageTo).toBe('en');
  });

  it('keeps the optimistic pair while its save and a focus refresh overlap', async () => {
    let finishSync: (response: SyncResponse) => void = () => {};
    mockSyncUserData.mockReturnValueOnce(
      new Promise<SyncResponse>((resolve) => {
        finishSync = resolve;
      }),
    );
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => usePreferences(true, isUpdatingFromServerRef));

    let save: Promise<void> | undefined;
    act(() => {
      save = result.current.setLearningLanguages('cs', 'vi');
    });
    expect(result.current.learningLanguageFrom).toBe('cs');
    expect(result.current.learningLanguageTo).toBe('vi');

    act(() => {
      result.current.applyServerPreferences({
        ...baseUser,
        language_from: 'fr',
        language_to: 'es',
        onboarding_completed_at: '2026-07-27T12:00:00.000Z',
      });
    });
    expect(result.current.learningLanguageFrom).toBe('cs');
    expect(result.current.learningLanguageTo).toBe('vi');

    await act(async () => {
      finishSync({
        success: true,
        user: {
          id: 'user-1',
          language_from: 'cs',
          language_to: 'vi',
          onboarding_completed_at: '2026-07-28T12:00:00.000Z',
        },
      } as SyncResponse);
      await save;
    });
  });

  it('restores an unconfirmed pair after a remount and rejects the old snapshot', async () => {
    localStorage.setItem(
      'get-word-pending-learning-language-pair',
      JSON.stringify({
        from: 'cs',
        to: 'vi',
        changedAt: '2026-07-28T12:00:00.000Z',
      }),
    );
    mockSyncUserData.mockRejectedValueOnce(new Error('offline'));
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => usePreferences(true, isUpdatingFromServerRef));

    await waitFor(() => {
      expect(result.current.learningLanguageFrom).toBe('cs');
      expect(result.current.learningLanguageTo).toBe('vi');
    });

    act(() => {
      result.current.applyServerPreferences({
        ...baseUser,
        language_from: 'fr',
        language_to: 'es',
        onboarding_completed_at: '2026-07-27T12:00:00.000Z',
      });
    });

    expect(result.current.learningLanguageFrom).toBe('cs');
    expect(result.current.learningLanguageTo).toBe('vi');
    expect(localStorage.getItem('get-word-pending-learning-language-pair')).not.toBeNull();
  });

  it('ignores saved onboarding markers when simulate first open is enabled', () => {
    process.env.NEXT_PUBLIC_GET_WORD_SIMULATE_FIRST_OPEN = 'true';
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => usePreferences(true, isUpdatingFromServerRef));

    act(() => {
      result.current.applyServerPreferences({
        ...baseUser,
        settings_language_selected_at: '2026-05-01T00:00:00.000Z',
        language_from: 'en',
        language_to: 'cs',
        onboarding_completed_at: '2026-05-01T00:00:00.000Z',
      });
    });

    expect(result.current.settingsLanguageSelectedAt).toBeNull();
    expect(result.current.learningLanguageFrom).toBeNull();
    expect(result.current.learningLanguageTo).toBeNull();
    expect(result.current.onboardingCompletedAt).toBeNull();
  });

  it('keeps learning onboarding after completing it in a simulated first-open session', async () => {
    process.env.NEXT_PUBLIC_GET_WORD_SIMULATE_FIRST_OPEN = 'true';
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() => usePreferences(true, isUpdatingFromServerRef));

    await act(async () => {
      await result.current.setLearningLanguages('en', 'cs');
    });

    act(() => {
      result.current.applyServerPreferences({
        ...baseUser,
        language_from: 'en',
        language_to: 'cs',
        onboarding_completed_at: '2026-05-01T00:00:00.000Z',
      });
    });

    expect(result.current.learningLanguageFrom).toBe('en');
    expect(result.current.learningLanguageTo).toBe('cs');
    expect(result.current.onboardingCompletedAt).toBe('2026-05-01T00:00:00.000Z');
  });

  it('does not re-sync unchanged server category filters', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result, rerender } = renderHook(
      ({ isHydrated, scopeKey }) =>
        useCategoryFilter(words, isHydrated, isUpdatingFromServerRef, scopeKey),
      { initialProps: { isHydrated: false, scopeKey: 'list-a' } }
    );

    act(() => {
      result.current.applyServerCategories(['animals']);
    });

    rerender({ isHydrated: true, scopeKey: 'list-a' });
    mockEnqueueOp.mockClear();

    act(() => {
      result.current.applyServerCategories(['animals']);
    });

    rerender({ isHydrated: true, scopeKey: 'list-a' });

    expect(mockEnqueueOp).not.toHaveBeenCalled();
  });

  it('defaults a new list scope to all of its categories', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result } = renderHook(() =>
      useCategoryFilter(words, true, isUpdatingFromServerRef, 'list-a')
    );

    expect(Array.from(result.current.selectedCategories).sort()).toEqual(['animals', 'travel']);
    expect(result.current.filteredWords).toHaveLength(2);
  });

  it('keeps category visibility scoped per list', () => {
    const isUpdatingFromServerRef = { current: false };
    const { result, rerender } = renderHook(
      ({ scopeKey, hookWords }) => useCategoryFilter(hookWords, true, isUpdatingFromServerRef, scopeKey),
      {
        initialProps: {
          scopeKey: 'list-a',
          hookWords: words,
        },
      }
    );

    act(() => {
      result.current.toggleCategory('travel');
    });

    expect(Array.from(result.current.selectedCategories)).toEqual(['animals']);
    expect(result.current.filteredWords.map((word) => word.id)).toEqual(['word-1']);

    const listBWords = [
      {
        id: 'word-3',
        category: ['Basic', 'word'],
        cz: 'ahoj',
        en: 'hello',
        vi: 'xin chao',
      },
    ] as NormalizedWord[];

    rerender({
      scopeKey: 'list-b',
      hookWords: listBWords,
    });

    expect(Array.from(result.current.selectedCategories)).toEqual(['Basic']);
    expect(result.current.filteredWords.map((word) => word.id)).toEqual(['word-3']);

    rerender({
      scopeKey: 'list-a',
      hookWords: words,
    });

    expect(Array.from(result.current.selectedCategories)).toEqual(['animals']);
    expect(result.current.filteredWords.map((word) => word.id)).toEqual(['word-1']);
  });

  it('filters same-named categories from different lists independently', () => {
    const isUpdatingFromServerRef = { current: false };
    const sameNamed = [
      {
        id: 'public-word',
        category: ['Basic', 'word'],
        categoryKey: 'public:cat',
        cz: 'ahoj',
        en: '',
        vi: 'xin chào',
      },
      {
        id: 'personal-word',
        category: ['Basic', 'word'],
        categoryKey: 'personal:cat',
        cz: 'děkuji',
        en: '',
        vi: 'cảm ơn',
      },
    ] as NormalizedWord[];
    const { result } = renderHook(() =>
      useCategoryFilter(sameNamed, true, isUpdatingFromServerRef, 'combined')
    );

    act(() => result.current.toggleCategory('public:cat'));

    expect(Array.from(result.current.selectedCategories)).toEqual(['personal:cat']);
    expect(result.current.filteredWords.map((word) => word.id)).toEqual(['personal-word']);
  });
});
