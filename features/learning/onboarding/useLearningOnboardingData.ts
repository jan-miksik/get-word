'use client';

import { useEffect, useMemo, useState } from 'react';
import { readPreferredPublicLanguage } from '@/lib/i18n/client-language';
import { readLandingLanguagePair } from '@/features/shared/languages/landingPairStorage';
import type { WordList, WordListItem } from '@/features/lists/types';
import {
  pickAutogenerateCommonSeed,
  isReverseDirectionList,
  sortMatchedWordLists,
  type MatchedWordList,
  type RecommendedReason,
} from './listRecommendations';
import type { LearningLanguage } from '@/features/shared/languages/types';
import { useSupportedLanguages } from '@/features/shared/languages/useSupportedLanguages';
import { apiFetch } from '@/features/shared/http/api-runtime';

type CommonListEstimate = {
  status: 'loading' | 'ready' | 'unavailable';
  wordCount: number | null;
  seedName: string | null;
};

type UseLearningOnboardingDataOptions = {
  initialFrom?: string | null;
  initialTo?: string | null;
};

type MatchesState = {
  key: string;
  status: 'ready' | 'error';
  matches: MatchedWordList[];
  recommendedList: MatchedWordList | null;
  recommendedReason: RecommendedReason | null;
};

type CommonListEstimateState = {
  key: string;
  estimate: CommonListEstimate;
};

function getLanguageName(languages: LearningLanguage[], code: string) {
  return languages.find((language) => language.code === code)?.name ?? code.toUpperCase();
}

function readRecommendedReason(value: unknown): RecommendedReason | null {
  return value === 'exact' || value === 'reverse' || value === 'fallback_seed'
    ? value
    : null;
}

function orderMatchedLists(
  data: { lists?: unknown; recommendedList?: unknown; recommendedReason?: unknown },
  languageFrom: string,
  languageTo: string,
) {
  const sorted = Array.isArray(data.lists)
    ? sortMatchedWordLists(data.lists, languageFrom, languageTo)
    : [];
  const recommendedList =
    data.recommendedList && typeof data.recommendedList === 'object'
      ? (data.recommendedList as MatchedWordList)
      : null;
  const recommendedReason = readRecommendedReason(data.recommendedReason);
  const recommendedInMatches =
    recommendedList && recommendedReason !== 'fallback_seed'
      ? sorted.find((list) => list.id === recommendedList.id) ?? recommendedList
      : null;

  return {
    matches: recommendedInMatches
      ? [
          recommendedInMatches,
          ...sorted.filter((list) => list.id !== recommendedInMatches.id),
        ]
      : sorted,
    recommendedList,
    recommendedReason,
  };
}

export function useLearningOnboardingData({
  initialFrom,
  initialTo,
}: UseLearningOnboardingDataOptions) {
  const { languages, loading: loadingLanguages } = useSupportedLanguages();
  // Default the pair from, in order: an explicit previously-synced choice
  // (initialFrom/initialTo), then the pair the visitor picked on the public
  // landing page before logging in, then the landing-page interface language
  // (falling back to browser detection) for the "I know" side.
  const [languageFrom, setLanguageFrom] = useState(
    () => initialFrom ?? readLandingLanguagePair()?.from ?? readPreferredPublicLanguage(),
  );
  const [languageTo, setLanguageTo] = useState(
    () => initialTo ?? readLandingLanguagePair()?.to ?? '',
  );
  const [matchesState, setMatchesState] = useState<MatchesState | null>(null);
  const [commonListEstimateState, setCommonListEstimateState] =
    useState<CommonListEstimateState | null>(null);

  const validLanguagePair = Boolean(languageFrom && languageTo && languageFrom !== languageTo);
  const languagePairKey = validLanguagePair ? `${languageFrom}|${languageTo}` : null;

  useEffect(() => {
    if (!languagePairKey) return;

    const controller = new AbortController();
    apiFetch(
      `/api/lists/matches?from=${encodeURIComponent(languageFrom)}&to=${encodeURIComponent(languageTo)}`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load matches'))))
      .then((data) => {
        const ordered = orderMatchedLists(data, languageFrom, languageTo);
        setMatchesState({ key: languagePairKey, status: 'ready', ...ordered });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setMatchesState({
          key: languagePairKey,
          status: 'error',
          matches: [],
          recommendedList: null,
          recommendedReason: null,
        });
      });
    return () => controller.abort();
  }, [languageFrom, languagePairKey, languageTo]);

  const matches = languagePairKey === matchesState?.key ? matchesState.matches : [];
  const recommendedList =
    languagePairKey === matchesState?.key ? matchesState.recommendedList : null;
  const recommendedReason =
    languagePairKey === matchesState?.key ? matchesState.recommendedReason : null;
  const matchesLoadFailed =
    languagePairKey === matchesState?.key && matchesState?.status === 'error';
  const loadingMatches = Boolean(languagePairKey && languagePairKey !== matchesState?.key);
  const canContinue = validLanguagePair;
  const targetLanguage = useMemo(
    () => languages.find((language) => language.code === languageTo),
    [languages, languageTo],
  );
  const languagePairLabel = canContinue
    ? `${getLanguageName(languages, languageFrom)} and ${getLanguageName(languages, languageTo)}`
    : '';
  const exactDirectionMatches = matches.filter(
    (list) => !isReverseDirectionList(list, languageFrom, languageTo),
  );
  const hasCommonLanguageList = exactDirectionMatches.some((list) => list.isCommon);
  const hasRecommendedAutogeneratedList = exactDirectionMatches.some(
    (list) => list.isRecommended && list.isAutogenerated,
  );
  const showListSetupActions = canContinue && !loadingMatches;
  const hasFallbackSeedRecommendation = Boolean(
    recommendedList && recommendedReason === 'fallback_seed',
  );
  const hasSelectableRecommendation = Boolean(
    recommendedList && recommendedReason === 'exact',
  );
  const hasReverseRecommendation = Boolean(
    recommendedList && recommendedReason === 'reverse',
  );
  const reverseRecommendationSourceName = hasReverseRecommendation
    ? recommendedList?.name ?? null
    : null;
  const showAutogenerateCommonList =
    showListSetupActions &&
    !matchesLoadFailed &&
    !hasCommonLanguageList &&
    !hasRecommendedAutogeneratedList &&
    !hasSelectableRecommendation &&
    !hasFallbackSeedRecommendation;
  const commonListEstimateKey = showAutogenerateCommonList ? languagePairKey : null;

  useEffect(() => {
    if (!commonListEstimateKey) return;

    const estimateRequestKey = commonListEstimateKey;
    let cancelled = false;

    async function loadCommonListEstimate() {
      try {
        const listsRes = await apiFetch('/api/lists');
        if (!listsRes.ok) throw new Error('Could not load seed lists');
        const listsData = await listsRes.json();
        if (cancelled) return;
        const availableLists: WordList[] = Array.isArray(listsData.lists) ? listsData.lists : [];
        const seedList = pickAutogenerateCommonSeed(availableLists, languageFrom, languageTo);
        if (!seedList) {
          setCommonListEstimateState({
            key: estimateRequestKey,
            estimate: { status: 'unavailable', wordCount: 0, seedName: null },
          });
          return;
        }

        const seedDetailsRes = await apiFetch(`/api/lists/${seedList.id}?include_media=false`);
        if (!seedDetailsRes.ok) throw new Error('Could not load seed list size');
        const seedDetails = await seedDetailsRes.json();
        if (cancelled) return;
        const seedItems: WordListItem[] = Array.isArray(seedDetails?.items)
          ? seedDetails.items
          : [];
        setCommonListEstimateState({
          key: estimateRequestKey,
          estimate: {
            status: 'ready',
            wordCount: seedItems.length,
            seedName: seedList.name,
          },
        });
      } catch {
        if (!cancelled) {
          setCommonListEstimateState({
            key: estimateRequestKey,
            estimate: { status: 'unavailable', wordCount: null, seedName: null },
          });
        }
      }
    }

    void loadCommonListEstimate();
    return () => {
      cancelled = true;
    };
  }, [commonListEstimateKey, languageFrom, languageTo]);

  const commonListEstimate =
    commonListEstimateKey === null
      ? null
      : commonListEstimateKey === commonListEstimateState?.key
        ? commonListEstimateState.estimate
        : { status: 'loading' as const, wordCount: null, seedName: null };

  return {
    languages,
    loadingLanguages,
    languageFrom,
    setLanguageFrom,
    languageTo,
    setLanguageTo,
    matches,
    recommendedList,
    recommendedReason,
    matchesLoadFailed,
    loadingMatches,
    commonListEstimate,
    targetLanguage,
    canContinue,
    languagePairLabel,
    showListSetupActions,
    hasFallbackSeedRecommendation,
    hasReverseRecommendation,
    reverseRecommendationSourceName,
    showAutogenerateCommonList,
  };
}
