'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WordList } from '@/features/lists/types';

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
    setError(null);
    try {
      if (!(await savePreferences())) return;
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
      onSelectList(data.list.id);
      router.push(`/lists?selected=${encodeURIComponent(data.list.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fork failed');
    } finally {
      setWorkingId(null);
    }
  }

  async function goToListsForExisting() {
    setError(null);
    try {
      if (!(await savePreferences())) return;
      router.push(`/lists?sourcePair=any&targetFrom=${encodeURIComponent(languageFrom)}&targetTo=${encodeURIComponent(languageTo)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save learning languages');
    }
  }

  async function autogenerateCommonList() {
    setWorkingId('common');
    setError(null);
    try {
      if (!(await savePreferences())) return;
      const listsRes = await fetch('/api/lists');
      const listsData = await listsRes.json();
      const availableLists: WordList[] = Array.isArray(listsData.lists) ? listsData.lists : [];
      const seedList =
        availableLists.find((list) => list.name.toLowerCase() === 'testing') ??
        availableLists.find((list) => list.name.toLowerCase().includes('testing')) ??
        availableLists[0];

      if (seedList) {
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
        router.push(`/lists?selected=${encodeURIComponent(forkData.list.id)}`);
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
      router.push(`/lists?selected=${encodeURIComponent(createData.list.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not autogenerate list');
    } finally {
      setWorkingId(null);
    }
  }

  async function createOwnList() {
    setError(null);
    try {
      if (!(await savePreferences())) return;
      router.push(`/lists?create=1&languageFrom=${encodeURIComponent(languageFrom)}&languageTo=${encodeURIComponent(languageTo)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save learning languages');
    }
  }

  function getItemCountLabel(count: number | undefined) {
    const safeCount = count ?? 0;
    return `${safeCount} ${safeCount === 1 ? 'word' : 'words'}`;
  }

  return (
    <div className="min-h-screen bg-background text-text flex items-start justify-center px-4 py-8 sm:py-14">
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
                <div key={list.id} className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-background p-2 transition-colors hover:border-accent sm:flex-row sm:items-center">
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-md px-2 py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                  <div className="flex shrink-0 gap-2 px-2 pb-1 sm:px-0 sm:pb-0">
                    <button
                      type="button"
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
                      disabled={workingId === `fork:${list.id}`}
                      onClick={() => forkList(list)}
                    >
                      {workingId === `fork:${list.id}` ? 'Forking...' : 'Fork'}
                    </button>
                  </div>
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
