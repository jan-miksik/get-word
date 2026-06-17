'use client';

import { useEffect, useMemo, useState } from 'react';
import { readPreferredPublicLanguage } from '@/lib/i18n/client-language';
import type { WordList, WordListItem } from '@/features/lists/types';
import {
  pickAutogenerateCommonSeed,
  sortMatchedWordLists,
  type MatchedWordList,
  type RecommendedReason,
} from './listRecommendations';
import type { LearningLanguage } from './types';

export type CommonListEstimate = {
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
  const [languages, setLanguages] = useState<LearningLanguage[]>([]);
  // Default the "I know" language to the visitor's landing-page language choice
  // (falling back to browser detection) so the pair starts from their native
  // language. An explicit, previously-synced choice (initialFrom) still wins.
  const [languageFrom, setLanguageFrom] = useState(
    () => initialFrom ?? readPreferredPublicLanguage(),
  );
  const [languageTo, setLanguageTo] = useState(initialTo ?? '');
  const [matchesState, setMatchesState] = useState<MatchesState | null>(null);
  const [loadingLanguages, setLoadingLanguages] = useState(true);
  const [commonListEstimateState, setCommonListEstimateState] =
    useState<CommonListEstimateState | null>(null);

  useEffect(() => {
    let cancelled = false;
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

  const validLanguagePair = Boolean(languageFrom && languageTo && languageFrom !== languageTo);
  const languagePairKey = validLanguagePair ? `${languageFrom}|${languageTo}` : null;

  useEffect(() => {
    if (!languagePairKey) return;

    const controller = new AbortController();
    fetch(
      `/api/lists/matches?from=${encodeURIComponent(languageFrom)}&to=${encodeURIComponent(languageTo)}`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load matches'))))
      .then((data) => {
        const ordered = orderMatchedLists(data, languageFrom, languageTo);
        setMatchesState({ key: languagePairKey, ...ordered });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setMatchesState({
          key: languagePairKey,
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
  const loadingMatches = Boolean(languagePairKey && languagePairKey !== matchesState?.key);
  const canContinue = validLanguagePair;
  const targetLanguage = useMemo(
    () => languages.find((language) => language.code === languageTo),
    [languages, languageTo],
  );
  const languagePairLabel = canContinue
    ? `${getLanguageName(languages, languageFrom)} and ${getLanguageName(languages, languageTo)}`
    : '';
  const hasCommonLanguageList = matches.some((list) => list.isCommon);
  const hasRecommendedAutogeneratedList = matches.some(
    (list) => list.isRecommended && list.isAutogenerated,
  );
  const showListSetupActions = canContinue && !loadingMatches;
  const hasFallbackSeedRecommendation = Boolean(
    recommendedList && recommendedReason === 'fallback_seed',
  );
  const hasSelectableRecommendation = Boolean(
    recommendedList && recommendedReason !== 'fallback_seed',
  );
  const showAutogenerateCommonList =
    showListSetupActions &&
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
        const listsRes = await fetch('/api/lists');
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

        const seedDetailsRes = await fetch(`/api/lists/${seedList.id}?include_media=false`);
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
    loadingMatches,
    commonListEstimate,
    targetLanguage,
    canContinue,
    languagePairLabel,
    showListSetupActions,
    hasFallbackSeedRecommendation,
    showAutogenerateCommonList,
  };
}
