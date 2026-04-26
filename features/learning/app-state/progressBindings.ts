import type { ProgressData } from "@/lib/sync";
import type { NormalizedWord } from "@/lib/words";

function normalizeWordBindingPart(value: string | undefined | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

export function getWordBindingKey(
  word: Pick<NormalizedWord, "cz" | "vi" | "canonicalWordId">
): string {
  if (word.canonicalWordId) {
    return `canonical:${word.canonicalWordId}`;
  }

  return `pair:${normalizeWordBindingPart(word.cz)}|${normalizeWordBindingPart(word.vi)}`;
}

export function buildProgressBindings(
  words: NormalizedWord[],
  progress: Record<string, ProgressData>
): Map<string, string> {
  const bindingByWordId = new Map<string, string>();
  const preferredProgressIdByKey = new Map<string, string>();

  for (const word of words) {
    if (!progress[word.id]) continue;
    const key = getWordBindingKey(word);
    if (!preferredProgressIdByKey.has(key)) {
      preferredProgressIdByKey.set(key, word.id);
    }
  }

  for (const word of words) {
    const directProgress = progress[word.id];
    if (directProgress) {
      bindingByWordId.set(word.id, word.id);
      continue;
    }

    const fallbackProgressId = preferredProgressIdByKey.get(getWordBindingKey(word));
    if (fallbackProgressId) {
      bindingByWordId.set(word.id, fallbackProgressId);
    }
  }

  return bindingByWordId;
}
