'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GoogleUsageResponse, WordList, WordListItem } from '@/features/lists/types';
import { syncUserData } from '@/lib/sync';

type LearningLanguage = {
  code: string;
  name: string;
  flag?: string;
  ttsAvailable: boolean;
  preferredVoice: string | null;
};

type Props = {
  initialFrom?: string | null;
  initialTo?: string | null;
  onComplete: (languageFrom: string, languageTo: string) => void | Promise<void>;
  onSelectList: (listId: string) => void;
};

type MatchedWordList = WordList & { isOwner?: boolean; itemCount?: number };
type GenerationStatus = {
  title: string;
  detail: string;
  estimateSeconds?: number;
};
type AudioGenerationSummary = {
  notice: string | null;
  requestedUnits: number;
  remainingUnits: number | null;
  generatedCount: number;
  failedCount: number;
};

const AUTOGENERATE_AUDIO_QUOTA_NOTICE =
  'Audio for this list needs {requested} Google TTS characters, but this account has {remaining} free characters left this month. I generated as much as the free quota allows, so only part of the list may have audio. Contact us and we can help finish it or raise the limit.';

function countTextUnits(texts: string[]) {
  return texts.reduce((total, text) => total + Array.from(text).length, 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(Math.max(0, Math.floor(value)));
}

function getAudioQuotaNotice(requested: number, remaining: number) {
  return AUTOGENERATE_AUDIO_QUOTA_NOTICE
    .replace('{requested}', formatNumber(requested))
    .replace('{remaining}', formatNumber(remaining));
}

export function estimateCommonListGenerationSeconds({
  itemCount,
  audioCharacterCount,
  audioClipCount,
}: {
  itemCount: number;
  audioCharacterCount: number;
  audioClipCount: number;
}) {
  const safeItemCount = Math.max(0, itemCount);
  const safeCharacters = Math.max(0, audioCharacterCount);
  const safeClips = Math.max(0, audioClipCount);
  const translationAndForkSeconds = 4 + safeItemCount * 0.35;
  const audioBatchSeconds = Math.ceil(safeClips / 3) * 2.2;
  const uploadSeconds = safeClips * 0.35;
  const characterSeconds = safeCharacters / 180;
  return Math.max(5, Math.ceil(translationAndForkSeconds + audioBatchSeconds + uploadSeconds + characterSeconds));
}

export function formatDurationEstimate(seconds: number) {
  const safeSeconds = Math.max(1, Math.ceil(seconds));
  if (safeSeconds < 60) return `about ${safeSeconds} sec`;
  const minutes = Math.ceil(safeSeconds / 60);
  return `about ${minutes} min`;
}

function getLanguageName(languages: LearningLanguage[], code: string) {
  return languages.find((language) => language.code === code)?.name ?? code.toUpperCase();
}

function filterLanguages(languages: LearningLanguage[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return languages;
  return languages.filter((language) => (
    language.name.toLowerCase().includes(normalizedQuery) ||
    language.code.toLowerCase().includes(normalizedQuery)
  ));
}

function LanguageCombobox({
  id,
  label,
  value,
  languages,
  loading,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  languages: LearningLanguage[];
  loading: boolean;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selectedLanguage = languages.find((language) => language.code === value);
  const hasSelection = Boolean(selectedLanguage || value);
  const shownLanguages = filterLanguages(languages, query);
  const placeholder = loading ? 'Loading languages...' : 'Search languages';

  function selectLanguage(code: string) {
    onChange(code);
    setQuery('');
    setOpen(false);
  }

  return (
    <label className="relative block min-w-0">
      <span className="mb-2 block text-lg font-semibold text-text sm:text-xl">{label}</span>
      <div className="min-h-[66px] rounded-lg border border-border-subtle bg-background px-3 py-2 shadow-sm focus-within:border-accent">
        <div className="mb-1 flex min-w-0 items-center gap-2 text-sm font-medium text-text">
          <span className="inline-flex min-w-6 justify-center text-lg" aria-hidden="true">
            {hasSelection ? selectedLanguage?.flag ?? '•' : ''}
          </span>
          <span className={`min-w-0 flex-1 truncate ${hasSelection ? '' : 'text-text-soft'}`}>
            {hasSelection ? selectedLanguage?.name ?? value.toUpperCase() : 'Select a language'}
          </span>
        </div>
        <input
          id={id}
          type="search"
          value={query}
          autoComplete="off"
          placeholder={placeholder}
          aria-label={`${label} language`}
          aria-expanded={open}
          aria-controls={`${id}-options`}
          className="w-full bg-transparent text-sm text-text outline-none placeholder:text-text-soft/70"
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
      </div>
      {open ? (
        <div
          id={`${id}-options`}
          role="listbox"
          className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-lg border border-border-subtle bg-background-elevated p-1 shadow-xl"
        >
          {loading ? (
            <div className="px-3 py-2 text-sm text-text-soft">Loading languages...</div>
          ) : shownLanguages.length > 0 ? (
            shownLanguages.map((language) => (
              <button
                key={language.code}
                type="button"
                role="option"
                aria-selected={language.code === value}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text hover:bg-background aria-selected:bg-background"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectLanguage(language.code)}
              >
                <span className="inline-flex min-w-6 justify-center text-base" aria-hidden="true">
                  {language.flag ?? ''}
                </span>
                <span className="min-w-0 flex-1 truncate">{language.name}</span>
                <span className="text-xs uppercase text-text-soft">{language.code}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-text-soft">No languages found.</div>
          )}
        </div>
      ) : null}
    </label>
  );
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
  const [loadingLanguages, setLoadingLanguages] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null);
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
      return;
    }
    const controller = new AbortController();
    setLoadingMatches(true);
    fetch(`/api/lists/matches?from=${encodeURIComponent(languageFrom)}&to=${encodeURIComponent(languageTo)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load matches'))))
      .then((data) => setMatches(Array.isArray(data.lists) ? data.lists : []))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setMatches([]);
      })
      .finally(() => setLoadingMatches(false));
    return () => controller.abort();
  }, [languageFrom, languageTo]);

  const canContinue = languageFrom && languageTo && languageFrom !== languageTo;
  const targetLanguage = useMemo(
    () => languages.find((language) => language.code === languageTo),
    [languages, languageTo],
  );

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

  async function loadTtsRemainingQuota() {
    try {
      const usageRes = await fetch('/api/google-usage');
      if (!usageRes.ok) return null;
      const usageData: GoogleUsageResponse = await usageRes.json();
      const ttsUsage = usageData.account.find((scope) => scope.scope === 'tts');
      if (!ttsUsage) return null;
      return Math.max(0, ttsUsage.account_limit - ttsUsage.used_units);
    } catch {
      return null;
    }
  }

  async function generateAutogeneratedListAudio(list: WordList): Promise<AudioGenerationSummary> {
    const detailsRes = await fetch(`/api/lists/${list.id}?include_media=false`);
    if (!detailsRes.ok) {
      throw new Error('Could not inspect generated list audio');
    }
    const details = await detailsRes.json();
    const items: WordListItem[] = Array.isArray(details.items) ? details.items : [];
    const targetItems = items.filter((item) => item.textTarget && item.audioStatus !== 'ready');
    const knownItems = items.filter((item) => item.textKnown && item.knownAudioStatus !== 'ready');
    const audioClipCount = targetItems.length + knownItems.length;
    const requestedUnits = countTextUnits([
      ...targetItems.map((item) => item.textTarget ?? ''),
      ...knownItems.map((item) => item.textKnown),
    ]);
    const remainingUnits = await loadTtsRemainingQuota();
    let quotaNotice =
      remainingUnits !== null && requestedUnits > remainingUnits
        ? getAudioQuotaNotice(requestedUnits, remainingUnits)
        : null;
    let generatedCount = 0;
    let failedCount = 0;

    setGenerationStatus({
      title: 'Generating audio',
      detail:
        audioClipCount > 0
          ? `${formatNumber(audioClipCount)} clips, ${formatNumber(requestedUnits)} Google TTS characters.`
          : 'No missing audio found for this list.',
      estimateSeconds: estimateCommonListGenerationSeconds({
        itemCount: items.length,
        audioCharacterCount: requestedUnits,
        audioClipCount,
      }),
    });

    async function generateBatch(
      batchItems: WordListItem[],
      audioField: 'target' | 'known',
      language: string,
    ) {
      if (batchItems.length === 0) return;
      for (let i = 0; i < batchItems.length; i += 200) {
        const chunk = batchItems.slice(i, i + 200);
        const res = await fetch('/api/audio/generate/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'google_tts',
            allow_partial: true,
            audio_field: audioField,
            items: chunk.map((item) => ({
              id: item.id,
              text: audioField === 'known' ? item.textKnown : item.textTarget ?? '',
              language,
            })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!quotaNotice && data?.quota_limit?.message) {
          quotaNotice = data.quota_limit.message;
        }
        if (!quotaNotice && data?.quota_warning?.detail) {
          quotaNotice = 'Audio generation could not verify the free quota, so only existing reusable audio may be available. Contact us and we can help finish it.';
        }
        const results = Array.isArray(data?.results) ? data.results : [];
        generatedCount += typeof data?.generated_count === 'number'
          ? data.generated_count
          : results.filter((result: { status?: string }) => result.status === 'ok').length;
        failedCount += results.filter((result: { status?: string }) => result.status === 'error').length;
        if (!res.ok && res.status !== 429) {
          throw new Error(data.error ?? 'Could not generate audio');
        }
        if (!res.ok && res.status === 429 && !quotaNotice) {
          quotaNotice = data.error ?? getAudioQuotaNotice(requestedUnits, 0);
        }
      }
    }

    await generateBatch(targetItems, 'target', list.languageTo);
    await generateBatch(knownItems, 'known', list.languageFrom);
    if (!quotaNotice && generatedCount === 0 && failedCount > 0) {
      quotaNotice = 'Audio generation could not finish for this list. Contact us and we can help finish it.';
    }
    return {
      notice: quotaNotice,
      requestedUnits,
      remainingUnits,
      generatedCount,
      failedCount,
    };
  }

  async function autogenerateCommonList() {
    setWorkingId('common');
    setGenerationStatus({
      title: 'Preparing common list',
      detail: 'Saving your languages and finding the best common seed...',
    });
    setError(null);
    let didNavigate = false;
    try {
      if (!(await savePreferencesForListNavigation())) return;
      const listsRes = await fetch('/api/lists');
      const listsData = await listsRes.json();
      const availableLists: WordList[] = Array.isArray(listsData.lists) ? listsData.lists : [];
      const seedList =
        availableLists.find((list) => list.isCommon) ??
        availableLists.find((list) => list.name.toLowerCase() === 'testing') ??
        availableLists.find((list) => list.name.toLowerCase().includes('testing')) ??
        availableLists[0];

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
            name: `Common ${languageFrom.toUpperCase()} -> ${languageTo.toUpperCase()}`,
            language_from: languageFrom,
            language_to: languageTo,
          }),
        });
        const forkData = await forkRes.json();
        if (!forkRes.ok) throw new Error(forkData.error ?? 'Could not autogenerate list');
        onSelectList(forkData.list.id);
        const audioSummary = await generateAutogeneratedListAudio(forkData.list);
        const params = new URLSearchParams({ selected: forkData.list.id });
        if (audioSummary.notice) params.set('audioNotice', audioSummary.notice);
        setGenerationStatus({
          title: 'Opening word list editor',
          detail: audioSummary.notice
            ? 'The list is ready with a quota notice.'
            : 'The list and audio are ready.',
        });
        didNavigate = true;
        router.push(`/lists?${params.toString()}`);
        return;
      }

      const createRes = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Common ${languageFrom.toUpperCase()} -> ${languageTo.toUpperCase()}`,
          language_from: languageFrom,
          language_to: languageTo,
          description: 'Autogenerated common list seed',
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error ?? 'Could not create list');
      onSelectList(createData.list.id);
      const params = new URLSearchParams({ selected: createData.list.id });
      setGenerationStatus({
        title: 'Opening word list editor',
        detail: 'Your empty list is ready.',
      });
      didNavigate = true;
      router.push(`/lists?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not autogenerate list');
    } finally {
      if (!didNavigate) {
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
    <div className="min-h-screen bg-background text-text flex items-start justify-center px-4 py-8 sm:py-14">
      {generationStatus ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background px-4 text-text">
          <section className="w-full max-w-md rounded-lg border border-border-subtle bg-background-elevated p-6 text-center shadow-xl">
            <div
              className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-border-subtle border-t-accent"
              aria-hidden="true"
            />
            <h2 className="text-base font-semibold text-text">{generationStatus.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-soft">{generationStatus.detail}</p>
            {generationStatus.estimateSeconds ? (
              <p className="mt-3 text-xs font-medium text-text-soft">
                Estimated time: {formatDurationEstimate(generationStatus.estimateSeconds)}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
      <section className="w-full max-w-3xl rounded-lg border border-border-subtle bg-background-elevated p-5 shadow-xl sm:p-7">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
          <LanguageCombobox
            id="language-from"
            label="I know"
            value={languageFrom}
            languages={languages}
            loading={loadingLanguages}
            onChange={setLanguageFrom}
          />
          <span className="hidden pb-2 text-text-soft sm:block">→</span>
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
          <p className="mt-3 rounded-md border border-border-subtle bg-background px-3 py-2 text-xs text-text-soft">
            {targetLanguage.name} is available for translation. Google TTS voice availability was not found, so audio can be added later if a provider supports it.
          </p>
        ) : null}

        {languageFrom === languageTo ? (
          <p className="mt-3 text-sm text-danger">it does not make much sense</p>
        ) : null}

        <div className="mt-6 border-t border-border-subtle pt-5">
          {!languageFrom || !languageTo ? (
            <p className="text-sm text-text-soft">Choose both languages to find matching word lists.</p>
          ) : loadingMatches ? (
            <p className="text-sm text-text-soft">Looking for existing lists...</p>
          ) : matches.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-text">
                Existing {getLanguageName(languages, languageFrom)} → {getLanguageName(languages, languageTo)} lists
              </h2>
              {matches.map((list) => (
                <div key={list.id} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-background px-3 py-2 text-left transition-colors hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                    disabled={workingId === list.id}
                    onClick={() => subscribeToList(list)}
                  >
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-medium text-text">{list.name}</span>
                      <span className="text-xs text-text-soft">{getItemCountLabel(list.itemCount)}</span>
                    </div>
                    <div className="mt-1 text-xs text-text-soft">
                      {list.description?.trim() || (list.isOwner ? 'Your list' : 'Public list')}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="shrink-0 self-center rounded-lg border border-border-subtle bg-background px-3 py-1.5 text-xs font-medium text-text-soft transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                    disabled={workingId === `fork:${list.id}`}
                    onClick={() => forkList(list)}
                  >
                    {workingId === `fork:${list.id}` ? 'Forking...' : 'Fork'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-text-soft">
                For what you want not yet exists any wordlist, however you can create one. Options are:
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="rounded-lg border border-border-subtle bg-background px-4 py-3 text-left hover:border-accent disabled:opacity-50"
                  onClick={autogenerateCommonList}
                  disabled={!canContinue || workingId === 'common'}
                >
                  <span className="block text-sm font-semibold text-text">
                    {workingId === 'common' ? 'Autogenerating...' : 'Autogenerate common list'}
                  </span>
                  <span className="mt-1 block text-xs text-text-soft">Most used words and phrases from the best available seed list.</span>
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border-subtle bg-background px-4 py-3 text-left hover:border-accent"
                  onClick={goToListsForExisting}
                  disabled={!canContinue}
                >
                  <span className="block text-sm font-semibold text-text">Go through existing lists</span>
                  <span className="mt-1 block text-xs text-text-soft">Find what suits you most and fork it.</span>
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border-subtle bg-background px-4 py-3 text-left hover:border-accent sm:col-span-2"
                  onClick={createOwnList}
                  disabled={!canContinue}
                >
                  <span className="block text-sm font-semibold text-text">Create own list</span>
                  <span className="mt-1 block text-xs text-text-soft">Start empty on the lists page.</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      </section>
    </div>
  );
}
