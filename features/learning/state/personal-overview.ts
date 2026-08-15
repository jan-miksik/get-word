import { normalizeLanguageCode } from '@/lib/i18n/languages';
import type { NormalizedWord } from '@/lib/words';

type StudyList = {
  id: string;
  languageFrom: string;
  languageTo: string;
  isOwnedPersonal?: boolean;
};

/**
 * The overview is intentionally broader than the active category filter:
 * personal words for the current pair must always remain visible there.
 */
export function includePersonalWordsForActivePair(
  filteredWords: readonly NormalizedWord[],
  allWords: readonly NormalizedWord[],
  lists: readonly StudyList[],
  activeListId: string | null,
): NormalizedWord[] {
  const activeList = lists.find((list) => list.id === activeListId);
  if (!activeList) return [...filteredWords];

  const languageFrom = normalizeLanguageCode(activeList.languageFrom);
  const languageTo = normalizeLanguageCode(activeList.languageTo);
  const personalListIds = new Set(
    lists
      .filter(
        (list) =>
          list.isOwnedPersonal === true &&
          normalizeLanguageCode(list.languageFrom) === languageFrom &&
          normalizeLanguageCode(list.languageTo) === languageTo,
      )
      .map((list) => list.id),
  );
  if (personalListIds.size === 0) return [...filteredWords];

  const result = [...filteredWords];
  const visibleIds = new Set(result.map((word) => word.id));
  for (const word of allWords) {
    if (
      !visibleIds.has(word.id) &&
      word.listId &&
      personalListIds.has(word.listId)
    ) {
      result.push(word);
      visibleIds.add(word.id);
    }
  }
  return result;
}
