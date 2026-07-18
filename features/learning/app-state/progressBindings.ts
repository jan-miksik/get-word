import type { NormalizedWord } from "@/lib/words";
import type { ProgressData } from "@/features/sync/types";

export function buildProgressBindings(
  words: NormalizedWord[],
  progress: Record<string, ProgressData>
): Map<string, string> {
  const bindingByWordId = new Map<string, string>();

  for (const word of words) {
    if (progress[word.id]) {
      bindingByWordId.set(word.id, word.id);
    }
  }

  return bindingByWordId;
}
