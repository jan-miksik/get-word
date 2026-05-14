'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GoogleUsageResponse, WordList, WordListItem } from '@/features/lists/types';
import { syncUserData } from '@/lib/sync';
import { normalizeLanguageCode } from '@/lib/i18n/languages';

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
  failedTargetCount: number;
  failedKnownCount: number;
};
type CommonListEstimate = {
  status: 'loading' | 'ready' | 'unavailable';
  wordCount: number | null;
  seedName: string | null;
};
type RankedAutogenerateSeed = {
  list: WordList;
  index: number;
  score: number;
};

const AUTOGENERATE_AUDIO_QUOTA_NOTICE =
  'Audio for this list needs {requested} Google TTS characters, but this account has {remaining} free characters left this month. I generated as much as the free quota allows, so only part of the list may have audio. Contact our tech support and we can help finish it or raise the limit.';
const AUDIO_REPAIR_INSTRUCTIONS =
  'Or you can try to fix it by yourself, click on category in the list, that should open overview of the words in the list, then click on Edit words and check what step has failures or missing parts. It will be most likely Audio. You can just generate the missing parts and confirm that in the last step.';

function countTextUnits(texts: string[]) {
  return texts.reduce((total, text) => total + Array.from(text).length, 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(Math.max(0, Math.floor(value)));
}

function getResponseField(data: Record<string, unknown>, key: string, nestedKey: string) {
  const value = data[key];
  if (!value || typeof value !== 'object' || !(nestedKey in value)) return null;
  const nestedValue = (value as Record<string, unknown>)[nestedKey];
  return typeof nestedValue === 'string' ? nestedValue : null;
}

function getCommonListFailureNotice(message: string) {
  const trimmed = message.trim() || 'Could not autogenerate list';
  const punctuation = /[.!?]$/.test(trimmed) ? '' : '.';
  return `${trimmed}${punctuation} You can finish the failed part manually from the list editor by editing the list and filling in the missing parts.`;
}

function getCommonListAudioFailureNotice(summary: AudioGenerationSummary) {
  const failed = formatNumber(summary.failedCount);
  const total = formatNumber(summary.generatedCount + summary.failedCount);
  const base = `The common list was created, but audio generation failed for ${failed} of ${total} clips.`;
  const detail = summary.notice ? ` ${summary.notice}` : '';
  return `${base}${detail} ${AUDIO_REPAIR_INSTRUCTIONS}`;
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

function getAutogenerateSeedScore(list: WordList, languageFrom: string, languageTo: string) {
  const requestedFrom = normalizeLanguageCode(languageFrom);
  const requestedTo = normalizeLanguageCode(languageTo);
  const listFrom = normalizeLanguageCode(list.languageFrom);
  const listTo = normalizeLanguageCode(list.languageTo);
  const normalizedName = list.name.trim().toLowerCase();
  const exactMatch = listFrom === requestedFrom && listTo === requestedTo;
  const reverseMatch = listFrom === requestedTo && listTo === requestedFrom;
  const overlapsFrom = listFrom === requestedFrom || listTo === requestedFrom;
  const overlapsTo = listFrom === requestedTo || listTo === requestedTo;

  let score = 0;
  if (exactMatch) score += 140;
  if (reverseMatch) score += 125;
  if (overlapsFrom) score += 35;
  if (overlapsTo) score += 35;
  if (list.isCommon) score += 30;
  if (list.isPublic) score += 10;
  if (normalizedName === 'testing') score -= 80;
  else if (normalizedName.includes('testing')) score -= 30;

  return score;
}

export function pickAutogenerateCommonSeed(
  lists: WordList[],
  languageFrom: string,
  languageTo: string,
): WordList | null {
  const commonSeedLists = lists.filter((list) => list.isCommon);
  const reusableLists = commonSeedLists.length > 0
    ? commonSeedLists
    : lists.filter((list) => list.isPublic);
  if (reusableLists.length === 0) return null;

  const ranked = reusableLists
    .map((list, index) => ({
      list,
      index,
      score: getAutogenerateSeedScore(list, languageFrom, languageTo),
    }))
    .sort(compareAutogenerateSeeds);

  return ranked[0]?.list ?? null;
}

function compareAutogenerateSeeds(a: RankedAutogenerateSeed, b: RankedAutogenerateSeed) {
  const updatedDelta = getListUpdatedTime(b.list) - getListUpdatedTime(a.list);
  return updatedDelta || b.score - a.score || a.index - b.index;
}

function getListUpdatedTime(list: WordList) {
  const value = list.updatedAt;
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
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
      <span className="mb-2 block text-lg font-extrabold uppercase tracking-wide sm:text-xl">{label}</span>
      <div className="onboarding-combobox min-h-[66px] px-3 py-2">
        <div className="mb-1 flex min-w-0 items-center gap-2 text-sm font-bold">
          <span className="inline-flex min-w-6 justify-center text-lg" aria-hidden="true">
            {hasSelection ? selectedLanguage?.flag ?? '•' : ''}
          </span>
          <span className={`min-w-0 flex-1 truncate ${hasSelection ? '' : 'onboarding-text-soft'}`}>
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
          className="onboarding-combobox-input w-full bg-transparent text-sm outline-none"
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
          className="onboarding-combobox-list absolute z-30 mt-2 max-h-72 w-full overflow-y-auto p-1"
        >
          {loading ? (
            <div className="px-3 py-2 text-sm onboarding-text-soft">Loading languages...</div>
          ) : shownLanguages.length > 0 ? (
            shownLanguages.map((language) => (
              <button
                key={language.code}
                type="button"
                role="option"
                aria-selected={language.code === value}
                className="onboarding-combobox-option flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectLanguage(language.code)}
              >
                <span className="inline-flex min-w-6 justify-center text-base" aria-hidden="true">
                  {language.flag ?? ''}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{language.name}</span>
                <span className="text-xs uppercase onboarding-text-soft">{language.code}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm onboarding-text-soft">No languages found.</div>
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
  const languagePairLabel = canContinue
    ? `${getLanguageName(languages, languageFrom)} and ${getLanguageName(languages, languageTo)}`
    : '';
  const hasCommonLanguageList = matches.some((list) => list.isCommon);
  const showListSetupActions = Boolean(canContinue && !loadingMatches);
  const showAutogenerateCommonList = showListSetupActions && !hasCommonLanguageList;

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
    const audioFailureNotice = 'The common list is ready, but audio generation could not finish. Audio can be added from the lists editor later.';
    const detailsRes = await fetch(`/api/lists/${list.id}?include_media=false`);
    if (!detailsRes.ok) {
      return {
        notice: audioFailureNotice,
        requestedUnits: 0,
        remainingUnits: null,
        generatedCount: 0,
        failedCount: 0,
        failedTargetCount: 0,
        failedKnownCount: 0,
      };
    }
    const details = await detailsRes.json().catch(() => ({}));
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
    let failedTargetCount = 0;
    let failedKnownCount = 0;

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
        let data: Record<string, unknown> = {};
        let res: Response;
        try {
          res = await fetch('/api/audio/generate/batch', {
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
          data = await res.json().catch(() => ({}));
        } catch {
          failedCount += chunk.length;
          if (audioField === 'target') failedTargetCount += chunk.length;
          else failedKnownCount += chunk.length;
          quotaNotice ??= audioFailureNotice;
          continue;
        }
        const quotaLimitMessage = getResponseField(data, 'quota_limit', 'message');
        const quotaWarningDetail = getResponseField(data, 'quota_warning', 'detail');
        if (!quotaNotice && quotaLimitMessage) {
          quotaNotice = quotaLimitMessage;
        }
        if (!quotaNotice && quotaWarningDetail) {
          quotaNotice = 'Audio generation could not verify the free quota, so only existing reusable audio may be available. Contact our tech support and we can help finish it.';
        }
        const results = Array.isArray(data?.results) ? data.results : [];
        generatedCount += typeof data?.generated_count === 'number'
          ? data.generated_count as number
          : results.filter((result: { status?: string }) => result.status === 'ok').length;
        const batchFailedCount = results.filter((result: { status?: string }) => result.status === 'error').length;
        failedCount += batchFailedCount;
        if (audioField === 'target') failedTargetCount += batchFailedCount;
        else failedKnownCount += batchFailedCount;
        if (!res.ok && res.status !== 429) {
          quotaNotice ??= typeof data.error === 'string' ? data.error : audioFailureNotice;
        }
        if (!res.ok && res.status === 429 && !quotaNotice) {
          quotaNotice = typeof data.error === 'string' ? data.error : getAudioQuotaNotice(requestedUnits, 0);
        }
      }
    }

    await generateBatch(targetItems, 'target', list.languageTo);
    await generateBatch(knownItems, 'known', list.languageFrom);
    if (!quotaNotice && generatedCount === 0 && failedCount > 0) {
      quotaNotice = 'Audio generation could not finish for this list. Contact our tech support and we can help finish it.';
    }
    return {
      notice: quotaNotice,
      requestedUnits,
      remainingUnits,
      generatedCount,
      failedCount,
      failedTargetCount,
      failedKnownCount,
    };
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
          }),
        });
        const forkData = await forkRes.json();
        if (!forkRes.ok) throw new Error(forkData.error ?? 'Could not autogenerate list');
        generatedListId = forkData.list.id;
        onSelectList(forkData.list.id);
        const audioSummary = await generateAutogeneratedListAudio(forkData.list);
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
              <h2 className="text-sm font-extrabold uppercase tracking-wide">
                Existing {languagePairLabel} lists
              </h2>
              {matches.map((list) => (
                <div key={list.id} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    className="onboarding-option min-w-0 flex-1 px-3 py-2 text-left disabled:opacity-50"
                    disabled={workingId === list.id}
                    onClick={() => subscribeToList(list)}
                  >
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-bold">{list.name}</span>
                      <span className="text-xs onboarding-text-soft">{getItemCountLabel(list.itemCount)}</span>
                    </div>
                    <div className="mt-1 text-xs onboarding-text-soft">
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
              ))}
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
