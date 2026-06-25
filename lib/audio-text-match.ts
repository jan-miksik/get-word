/**
 * Whether two texts would map to the "same" spoken audio for our purposes.
 *
 * When a word is edited in the translation step we keep the previously linked
 * audio only for cosmetic changes — differences in letter case or the
 * addition/removal of dots (and incidental whitespace). Any other change means
 * the word is genuinely different, so the old audio no longer matches and must
 * be disconnected (so the audio step flags it for regeneration/reuse).
 */
export function normalizeAudioText(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAudioTextEquivalent(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeAudioText(a) === normalizeAudioText(b);
}
