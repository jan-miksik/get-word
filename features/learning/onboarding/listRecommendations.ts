import type { WordList } from '@/features/lists/types';
import { normalizeLanguageCode } from '@/lib/i18n/languages';

export type MatchedWordList = WordList & { isOwner?: boolean; itemCount?: number };
export type RecommendedReason = 'exact' | 'reverse' | 'fallback_seed';

type RankedAutogenerateSeed = {
  list: WordList;
  index: number;
  score: number;
};

type RankedMatchedList = {
  list: MatchedWordList;
  index: number;
  score: number;
};

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

function getMatchedListScore(list: MatchedWordList, languageFrom: string, languageTo: string) {
  const requestedFrom = normalizeLanguageCode(languageFrom);
  const requestedTo = normalizeLanguageCode(languageTo);
  const listFrom = normalizeLanguageCode(list.languageFrom);
  const listTo = normalizeLanguageCode(list.languageTo);
  const normalizedName = list.name.trim().toLowerCase();
  const exactMatch = listFrom === requestedFrom && listTo === requestedTo;
  const reverseMatch = listFrom === requestedTo && listTo === requestedFrom;

  let score = 0;
  if (list.isCommon) score += 1000;
  if (exactMatch) score += 120;
  if (reverseMatch) score += 100;
  if (normalizedName.includes('general')) score += 35;
  if (normalizedName.includes('common')) score += 35;
  if (normalizedName.includes('seed')) score += 20;
  if (list.isPublic) score += 5;
  if (normalizedName === 'testing') score -= 80;
  else if (normalizedName.includes('testing')) score -= 30;

  return score;
}

export function sortMatchedWordLists(
  lists: MatchedWordList[],
  languageFrom: string,
  languageTo: string,
): MatchedWordList[] {
  return lists
    .map((list, index) => ({
      list,
      index,
      score: getMatchedListScore(list, languageFrom, languageTo),
    }))
    .sort(compareMatchedLists)
    .map(({ list }) => list);
}

function compareMatchedLists(a: RankedMatchedList, b: RankedMatchedList) {
  return b.score - a.score || (b.list.itemCount ?? 0) - (a.list.itemCount ?? 0) || a.index - b.index;
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
