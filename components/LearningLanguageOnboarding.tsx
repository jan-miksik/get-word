'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WordList, WordListItem } from '@/features/lists/types';
import {
  estimateCommonListGenerationSeconds,
  formatDurationEstimate,
  pickAutogenerateCommonSeed,
  sortMatchedWordLists,
  type MatchedWordList,
  type RecommendedReason,
} from '@/features/learning/onboarding/listRecommendations';
import {
  countTextUnits,
  formatNumber,
  generateCommonListAudio,
  getCommonListAudioFailureNotice,
  getCommonListFailureNotice,
  type GenerationStatus,
} from '@/features/learning/onboarding/commonListAudioGeneration';
import { LanguageCombobox } from '@/features/learning/onboarding/LanguageCombobox';
import type { LearningLanguage } from '@/features/learning/onboarding/types';
import { syncUserData } from '@/lib/sync';

export {
  estimateCommonListGenerationSeconds,
  formatDurationEstimate,
  pickAutogenerateCommonSeed,
  sortMatchedWordLists,
} from '@/features/learning/onboarding/listRecommendations';

type Props = {
  initialFrom?: string | null;
  initialTo?: string | null;
  onComplete: (languageFrom: string, languageTo: string) => void | Promise<void>;
  onSelectList: (listId: string) => void;
};

type CommonListEstimate = {
  status: 'loading' | 'ready' | 'unavailable';
  wordCount: number | null;
  seedName: string | null;
};

function getLanguageName(languages: LearningLanguage[], code: string) {
  return languages.find((language) => language.code === code)?.name ?? code.toUpperCase();
}

export function LearningLanguageOnboarding({
  initialFrom,
  initialTo,
  onComplete,
  onSelectList,
}: Props) {
  const router = useRouter();
  const [languages, setLanguages] = useState<LearningLanguage[]>([]);
  const [languageFrom, setLanguageFrom] = useState(initialFrom ?? 'en');
  const [languageTo, setLanguageTo] = useState(initialTo ?? '');
  const [matches, setMatches] = useState<MatchedWordList[]>([]);
  const [recommendedList, setRecommendedList] = useState<MatchedWordList | null>(null);
  const [recommendedReason, setRecommendedReason] = useState<RecommendedReason | null>(null);
  const [loadingLanguages, setLoadingLanguages] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null);
  const [commonListEstimate, setCommonListEstimate] = useState<CommonListEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingLanguages(true);
    fetch('/api/languages')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setLanguages(Array.isArray(data.languages) ? data.languages : []);
      })
      .catch(() => {
        if (!cancelled) setLanguages([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingLanguages(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!languageFrom || !languageTo || languageFrom === languageTo) {
      setMatches([]);
      setRecommendedList(null);
      setRecommendedReason(null);
      return;
    }
    const controller = new AbortController();
    setLoadingMatches(true);
    fetch(`/api/lists/matches?from=${encodeURIComponent(languageFrom)}&to=${encodeURIComponent(languageTo)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load matches'))))
      .then((data) => {
        const sorted = Array.isArray(data.lists)
          ? sortMatchedWordLists(data.lists, languageFrom, languageTo)
          : [];
        const serverRecommended = data.recommendedList && typeof data.recommendedList === 'object'
          ? data.recommendedList as MatchedWordList
          : null;
        const serverReason = (
          data.recommendedReason === 'exact' ||
          data.recommendedReason === 'reverse' ||
          data.recommendedReason === 'fallback_seed'
        )
          ? data.recommendedReason as RecommendedReason
          : null;
        const recommendedInMatches = serverRecommended && serverReason !== 'fallback_seed'
          ? sorted.find((list) => list.id === serverRecommended.id) ?? serverRecommended
          : null;

        setMatches(
          recommendedInMatches
            ? [
                recommendedInMatches,
                ...sorted.filter((list) => list.id !== recommendedInMatches.id),
              ]
            : sorted,
        );
        setRecommendedList(serverRecommended);
        setRecommendedReason(serverReason);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setMatches([]);
        setRecommendedList(null);
        setRecommendedReason(null);
      })
      .finally(() => setLoadingMatches(false));
    return () => controller.abort();
  }, [languageFrom, languageTo]);

  const canContinue = languageFrom && languageTo && languageFrom !== languageTo;
  const targetLanguage = useMemo(
    () => languages.find((language) => language.code === languageTo),
    [languages, languageTo],
  );
  const languagePairLabel = canContinue
    ? `${getLanguageName(languages, languageFrom)} and ${getLanguageName(languages, languageTo)}`
    : '';
  const hasCommonLanguageList = matches.some((list) => list.isCommon);
  const showListSetupActions = Boolean(canContinue && !loadingMatches);
  const hasFallbackSeedRecommendation = Boolean(recommendedList && recommendedReason === 'fallback_seed');
  const showAutogenerateCommonList = showListSetupActions && !hasCommonLanguageList && !hasFallbackSeedRecommendation;

  useEffect(() => {
    if (!showAutogenerateCommonList) {
      setCommonListEstimate(null);
      return;
    }

    let cancelled = false;
    setCommonListEstimate({ status: 'loading', wordCount: null, seedName: null });

    async function loadCommonListEstimate() {
      try {
        const listsRes = await fetch('/api/lists');
        if (!listsRes.ok) throw new Error('Could not load seed lists');
        const listsData = await listsRes.json();
        if (cancelled) return;
        const availableLists: WordList[] = Array.isArray(listsData.lists) ? listsData.lists : [];
        const seedList = pickAutogenerateCommonSeed(availableLists, languageFrom, languageTo);
        if (!seedList) {
          setCommonListEstimate({ status: 'unavailable', wordCount: 0, seedName: null });
          return;
        }

        const seedDetailsRes = await fetch(`/api/lists/${seedList.id}?include_media=false`);
        if (!seedDetailsRes.ok) throw new Error('Could not load seed list size');
        const seedDetails = await seedDetailsRes.json();
        if (cancelled) return;
        const seedItems: WordListItem[] = Array.isArray(seedDetails?.items) ? seedDetails.items : [];
        setCommonListEstimate({
          status: 'ready',
          wordCount: seedItems.length,
          seedName: seedList.name,
        });
      } catch {
        if (!cancelled) {
          setCommonListEstimate({ status: 'unavailable', wordCount: null, seedName: null });
        }
      }
    }

    void loadCommonListEstimate();
    return () => {
      cancelled = true;
    };
  }, [languageFrom, languageTo, showAutogenerateCommonList]);

  async function savePreferences() {
    if (!canContinue) return false;
    await onComplete(languageFrom, languageTo);
    return true;
  }

  async function savePreferencesForListNavigation() {
    if (!canContinue) return false;
    await syncUserData({
      language_from: languageFrom,
      language_to: languageTo,
      onboarding_completed: true,
    });
    return true;
  }

  async function subscribeToList(list: MatchedWordList) {
    setWorkingId(list.id);
    setError(null);
    try {
      if (!(await savePreferences())) return;
      onSelectList(list.id);
      if (!list.isOwner) {
        const res = await fetch(`/api/lists/${list.id}/subscribe`, { method: 'POST' });
        if (!res.ok && res.status !== 409) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Subscribe failed');
        }
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not select list');
    } finally {
      setWorkingId(null);
    }
  }

  async function forkList(list: MatchedWordList) {
    setWorkingId(`fork:${list.id}`);
    setGenerationStatus({
      title: 'Forking word list',
      detail: `Copying ${list.name} and preparing the editor...`,
      estimateSeconds: list.itemCount
        ? estimateCommonListGenerationSeconds({
            itemCount: list.itemCount,
            audioCharacterCount: 0,
            audioClipCount: 0,
          })
        : undefined,
    });
    setError(null);
    let didNavigate = false;
    try {
      if (!(await savePreferencesForListNavigation())) return;
      const res = await fetch(`/api/lists/${list.id}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language_from: languageFrom,
          language_to: languageTo,
          translation_provider: 'google',
          source_language: list.languageFrom,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Fork failed');
      const params = new URLSearchParams({
        selected: data.list.id,
        forked: '1',
        forkedFromName: list.name,
      });
      setGenerationStatus({
        title: 'Opening word list editor',
        detail: 'Your fork is ready.',
      });
      didNavigate = true;
      router.push(`/lists?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fork failed');
    } finally {
      if (!didNavigate) {
        setWorkingId(null);
        setGenerationStatus(null);
      }
    }
  }

  async function goToListsForExisting() {
    setError(null);
    setGenerationStatus({
      title: 'Opening word lists',
      detail: 'Saving your languages before showing available lists...',
    });
    let didNavigate = false;
    try {
      if (!(await savePreferencesForListNavigation())) return;
      didNavigate = true;
      router.push(`/lists?sourcePair=any&targetFrom=${encodeURIComponent(languageFrom)}&targetTo=${encodeURIComponent(languageTo)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save learning languages');
    } finally {
      if (!didNavigate) setGenerationStatus(null);
    }
  }

  async function autogenerateCommonList() {
    setWorkingId('common');
    setGenerationStatus({
      title: 'Preparing common list',
      detail: 'Finding the best common seed...',
    });
    setError(null);
    let didComplete = false;
    let didNavigateToLists = false;
    let generatedListId: string | null = null;
    try {
      const listsRes = await fetch('/api/lists');
      const listsData = await listsRes.json();
      const availableLists: WordList[] = Array.isArray(listsData.lists) ? listsData.lists : [];
      const seedList = pickAutogenerateCommonSeed(availableLists, languageFrom, languageTo);

      if (seedList) {
        const seedDetailsRes = await fetch(`/api/lists/${seedList.id}?include_media=false`);
        const seedDetails = seedDetailsRes.ok ? await seedDetailsRes.json() : null;
        const seedItems: WordListItem[] = Array.isArray(seedDetails?.items) ? seedDetails.items : [];
        const seedCharacterCount = countTextUnits(seedItems.flatMap((item) => [
          item.textKnown,
          item.textTarget ?? '',
        ]));
        setGenerationStatus({
          title: 'Creating common list',
          detail: `Copying and translating ${formatNumber(seedItems.length)} entries from ${seedList.name}.`,
          estimateSeconds: estimateCommonListGenerationSeconds({
            itemCount: seedItems.length,
            audioCharacterCount: seedCharacterCount,
            audioClipCount: seedItems.length * 2,
          }),
        });
        const forkRes = await fetch(`/api/lists/${seedList.id}/fork`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Common ${languageFrom.toUpperCase()} / ${languageTo.toUpperCase()}`,
            language_from: languageFrom,
            language_to: languageTo,
            translation_provider: 'google',
            source_language: seedList.languageFrom,
          }),
        });
        const forkData = await forkRes.json();
        if (!forkRes.ok) throw new Error(forkData.error ?? 'Could not autogenerate list');
        generatedListId = forkData.list.id;
        onSelectList(forkData.list.id);
        const audioSummary = await generateCommonListAudio({
          list: forkData.list,
          setGenerationStatus,
        });
        if (audioSummary.failedCount > 0) {
          const notice = getCommonListAudioFailureNotice(audioSummary);
          setError(notice);
          setGenerationStatus({
            title: 'Opening word list editor',
            detail: 'The common list needs audio repair.',
          });
          const params = new URLSearchParams({
            selected: forkData.list.id,
            commonListNotice: notice,
            fixAudio: audioSummary.failedTargetCount > 0 ? 'target' : 'known',
          });
          didNavigateToLists = true;
          router.push(`/lists?${params.toString()}`);
          return;
        }
        setGenerationStatus({
          title: 'Opening app',
          detail: audioSummary.notice
            ? 'The common list is ready. Audio can continue from the editor later.'
            : 'The list and audio are ready.',
        });
        await onComplete(languageFrom, languageTo);
        didComplete = true;
        return;
      }

      const createRes = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Common ${languageFrom.toUpperCase()} / ${languageTo.toUpperCase()}`,
          language_from: languageFrom,
          language_to: languageTo,
          description: 'Autogenerated common list seed',
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error ?? 'Could not create list');
      generatedListId = createData.list.id;
      onSelectList(createData.list.id);
      setGenerationStatus({
        title: 'Opening app',
        detail: 'Your empty list is ready.',
      });
      await onComplete(languageFrom, languageTo);
      didComplete = true;
    } catch (err) {
      const notice = getCommonListFailureNotice(err instanceof Error ? err.message : 'Could not autogenerate list');
      setError(notice);
      setGenerationStatus({
        title: 'Opening word lists',
        detail: 'The common list needs a manual finish.',
      });
      const params = new URLSearchParams({
        commonListNotice: notice,
        targetFrom: languageFrom,
        targetTo: languageTo,
      });
      if (generatedListId) {
        params.set('selected', generatedListId);
      } else {
        params.set('sourcePair', 'any');
      }
      didNavigateToLists = true;
      router.push(`/lists?${params.toString()}`);
    } finally {
      if (!didComplete && !didNavigateToLists) {
        setWorkingId(null);
        setGenerationStatus(null);
      }
    }
  }

  async function createOwnList() {
    setError(null);
    setGenerationStatus({
      title: 'Opening word list editor',
      detail: 'Saving your languages before creating the list...',
    });
    let didNavigate = false;
    try {
      if (!(await savePreferencesForListNavigation())) return;
      didNavigate = true;
      router.push(`/lists?create=1&languageFrom=${encodeURIComponent(languageFrom)}&languageTo=${encodeURIComponent(languageTo)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save learning languages');
    } finally {
      if (!didNavigate) setGenerationStatus(null);
    }
  }

  function getItemCountLabel(count: number | undefined) {
    const safeCount = count ?? 0;
    return `${safeCount} ${safeCount === 1 ? 'word' : 'words'}`;
  }

  return (
    <div className="onboarding-screen min-h-screen flex items-start justify-center px-4 py-8 sm:py-14">
      {generationStatus ? (
        <div className="onboarding-overlay fixed inset-0 z-[80] flex items-center justify-center px-4">
          <section className="onboarding-card w-full max-w-md p-6 text-center">
            <div
              className="onboarding-spinner mx-auto mb-4 h-10 w-10 animate-spin rounded-full"
              aria-hidden="true"
            />
            <h2 className="text-base font-extrabold">{generationStatus.title}</h2>
            <p className="mt-2 text-sm leading-relaxed onboarding-text-soft">{generationStatus.detail}</p>
            {generationStatus.estimateSeconds ? (
              <p className="mt-3 text-xs font-bold onboarding-text-soft">
                Estimated time: {formatDurationEstimate(generationStatus.estimateSeconds)}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
      <section className="onboarding-card w-full max-w-3xl p-5 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <LanguageCombobox
            id="language-from"
            label="I know"
            value={languageFrom}
            languages={languages}
            loading={loadingLanguages}
            onChange={setLanguageFrom}
          />
          <LanguageCombobox
            id="language-to"
            label="I want to learn"
            value={languageTo}
            languages={languages}
            loading={loadingLanguages}
            onChange={setLanguageTo}
          />
        </div>

        {targetLanguage && !targetLanguage.ttsAvailable ? (
          <p className="onboarding-notice mt-3 rounded-md px-3 py-2 text-xs">
            {targetLanguage.name} is available for translation. Google TTS voice availability was not found, so audio can be added later if a provider supports it.
          </p>
        ) : null}

        {languageFrom === languageTo ? (
          <p className="onboarding-error mt-3 text-sm">it does not make much sense</p>
        ) : null}

        <div className="onboarding-divider mt-6 pt-5">
          {!languageFrom || !languageTo ? (
            <p className="text-sm onboarding-text-soft">Choose both languages to find matching word lists.</p>
          ) : loadingMatches ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed onboarding-text-soft">
                Choose from existing word lists, create your own, or fork a list and customize it to fit what you want to learn.
              </p>
              <p className="text-sm onboarding-text-soft">Looking for existing lists...</p>
            </div>
          ) : matches.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed onboarding-text-soft">
                Choose from existing word lists, create your own, or fork a list and customize it to fit what you want to learn.
              </p>
              {hasFallbackSeedRecommendation && recommendedList ? (
                <div className="flex items-stretch gap-2">
                  <div className="onboarding-option min-w-0 flex-1 border-[var(--ob-accent)] bg-[var(--ob-accent)] px-3 py-2 text-left text-[color:var(--ob-surface)]">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-bold">{recommendedList.name}</span>
                      <span className="rounded-full border border-[var(--ob-ink)] bg-[var(--ob-surface)] px-2 py-0.5 text-[10px] font-black uppercase text-[color:var(--ob-ink)]">
                        seed
                      </span>
                      <span className="text-xs text-[color:var(--ob-surface)] opacity-[0.85]">
                        {getItemCountLabel(recommendedList.itemCount)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--ob-surface)] opacity-[0.85]">
                      No exact selected list exists yet. Create a fork from this basic seed.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="onboarding-option-secondary shrink-0 self-center px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                    disabled={workingId === `fork:${recommendedList.id}`}
                    onClick={() => forkList(recommendedList)}
                  >
                    {workingId === `fork:${recommendedList.id}` ? 'Forking...' : 'Fork'}
                  </button>
                </div>
              ) : null}
              <h2 className="text-sm font-extrabold uppercase tracking-wide">
                Existing {languagePairLabel} lists
              </h2>
              {matches.map((list) => {
                const isRecommended = list.id === recommendedList?.id && recommendedReason !== 'fallback_seed';
                const optionTextSoftClass = isRecommended
                  ? 'text-[color:var(--ob-surface)] opacity-[0.85]'
                  : 'onboarding-text-soft';

                return (
                  <div key={list.id} className="flex items-stretch gap-2">
                    <button
                      type="button"
                      className={[
                        'onboarding-option min-w-0 flex-1 px-3 py-2 text-left disabled:opacity-50',
                        isRecommended
                          ? 'border-[var(--ob-accent)] bg-[var(--ob-accent)] text-[color:var(--ob-surface)]'
                          : '',
                      ].join(' ')}
                      disabled={workingId === list.id}
                      onClick={() => subscribeToList(list)}
                    >
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-bold">{list.name}</span>
                        {isRecommended ? (
                          <span className="rounded-full border border-[var(--ob-ink)] bg-[var(--ob-surface)] px-2 py-0.5 text-[10px] font-black uppercase text-[color:var(--ob-ink)]">
                            recommended
                          </span>
                        ) : null}
                        <span className={`text-xs ${optionTextSoftClass}`}>{getItemCountLabel(list.itemCount)}</span>
                      </div>
                      <div className={`mt-1 text-xs ${optionTextSoftClass}`}>
                        {list.description?.trim() || (list.isOwner ? 'Your list' : 'Public list')}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="onboarding-option-secondary shrink-0 self-center px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                      disabled={workingId === `fork:${list.id}`}
                      onClick={() => forkList(list)}
                    >
                      {workingId === `fork:${list.id}` ? 'Forking...' : 'Fork'}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : hasFallbackSeedRecommendation && recommendedList ? (
            <div className="space-y-3">
              <p className="text-sm onboarding-text-soft">
                No exact selected list exists yet for {languagePairLabel}. You can create a fork from the basic seed and customize it.
              </p>
              <div className="flex items-stretch gap-2">
                <div className="onboarding-option min-w-0 flex-1 border-[var(--ob-accent)] bg-[var(--ob-accent)] px-3 py-2 text-left text-[color:var(--ob-surface)]">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-bold">{recommendedList.name}</span>
                    <span className="rounded-full border border-[var(--ob-ink)] bg-[var(--ob-surface)] px-2 py-0.5 text-[10px] font-black uppercase text-[color:var(--ob-ink)]">
                      seed
                    </span>
                    <span className="text-xs text-[color:var(--ob-surface)] opacity-[0.85]">
                      {getItemCountLabel(recommendedList.itemCount)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--ob-surface)] opacity-[0.85]">
                    {recommendedList.description?.trim() || 'Basic list seed'}
                  </div>
                </div>
                <button
                  type="button"
                  className="onboarding-option-secondary shrink-0 self-center px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                  disabled={workingId === `fork:${recommendedList.id}`}
                  onClick={() => forkList(recommendedList)}
                >
                  {workingId === `fork:${recommendedList.id}` ? 'Forking...' : 'Fork'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm onboarding-text-soft">
                No matching lists yet for {languagePairLabel}. You can generate a common list from the best available seed, browse other lists, or start your own.
              </p>
            </div>
          )}

          {showListSetupActions ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {showAutogenerateCommonList ? (
                <button
                  type="button"
                  className="onboarding-option px-4 py-3 text-left disabled:opacity-50"
                  onClick={autogenerateCommonList}
                  disabled={!canContinue || workingId === 'common'}
                >
                  <span className="block text-sm font-extrabold">
                    {workingId === 'common' ? 'Autogenerating...' : 'Autogenerate common list'}
                  </span>
                  <span className="mt-1 block text-xs onboarding-text-soft">
                    {commonListEstimate?.status === 'loading'
                      ? 'Checking how many words will be generated...'
                      : commonListEstimate?.status === 'ready'
                        ? `${formatNumber(commonListEstimate.wordCount ?? 0)} ${commonListEstimate.wordCount === 1 ? 'word' : 'words'} will be generated${commonListEstimate.seedName ? ` from ${commonListEstimate.seedName}` : ''}.`
                        : commonListEstimate?.status === 'unavailable'
                          ? 'Word count is not available yet; the best available seed will be used.'
                          : 'Most used words and phrases from the best available seed list.'}
                  </span>
                </button>
              ) : null}
              {matches.length === 0 ? (
                <button
                  type="button"
                  className="onboarding-option px-4 py-3 text-left"
                  onClick={goToListsForExisting}
                  disabled={!canContinue}
                >
                  <span className="block text-sm font-extrabold">Go through existing lists</span>
                  <span className="mt-1 block text-xs onboarding-text-soft">Find what suits you most and fork it.</span>
                </button>
              ) : null}
              <button
                type="button"
                className="onboarding-option px-4 py-3 text-left"
                onClick={createOwnList}
                disabled={!canContinue}
              >
                <span className="block text-sm font-extrabold">Create own list</span>
                <span className="mt-1 block text-xs onboarding-text-soft">Start empty on the lists page.</span>
              </button>
            </div>
          ) : null}
        </div>

        {error ? <p className="onboarding-error mt-4 text-sm">{error}</p> : null}
      </section>
    </div>
  );
}
