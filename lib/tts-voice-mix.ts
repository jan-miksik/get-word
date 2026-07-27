const DEFAULT_VOICE_ID = "default";

/**
 * Deterministic voice per text: the same text always maps to the same voice in
 * the given pool.
 *
 * Two properties matter. A set of clips gets a mix of voices rather than one
 * narrator reading everything, and the mapping is stable — so the content hash
 * (`text + language + provider + voice`) keeps matching across users, sessions
 * and regenerations, and a mix costs no extra synthesis. FNV-1a keeps it
 * dependency-free and identical on every machine.
 *
 * Returns the `"default"` sentinel for an empty pool, which callers pass
 * straight through to Google as "no explicit voice".
 */
export function pickVoiceForText(text: string, voices: string[]): string {
  if (voices.length === 0) return DEFAULT_VOICE_ID;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return voices[(hash >>> 0) % voices.length];
}
