import type { ProgressData } from '@/features/sync/contracts';
import { isDue, type NormalizedWord } from '@/lib/words';

/**
 * Offer another personal batch only after the current one has actually been
 * worked through: unseen items and due repeats both keep the prompt hidden.
 * Settling items do not — they already have a future review scheduled.
 */
export function shouldOfferMorePersonalWords(input: {
  words: NormalizedWord[];
  progress: Record<string, ProgressData>;
  personalListIds: ReadonlySet<string>;
}): boolean {
  const personalWords = input.words.filter(
    (word) => word.listId && input.personalListIds.has(word.listId),
  );
  if (personalWords.length === 0) return false;

  return personalWords.every((word) => {
    const itemProgress = input.progress[word.id];
    if (!itemProgress || itemProgress.stageIndex === 0) return false;
    return !isDue(itemProgress);
  });
}
