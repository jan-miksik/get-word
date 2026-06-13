/**
 * Voice selection for list audio generation.
 *
 * - `single` covers both the Google default voice (`voiceId === 'default'`) and a
 *   single explicit voice applied to every word.
 * - `mix` spreads the explicitly listed voices across the list. Each word is
 *   assigned a voice deterministically from its text, so the same word always
 *   maps to the same voice. That keeps the dedup cache (`hash(text + voiceId)`)
 *   effective across regenerations and lists, so "Mix" does not cost extra
 *   Google synthesis. An empty `voiceIds` means no voices are selected, so words
 *   fall back to Google's default voice.
 */
export type VoiceSelection =
  | { mode: 'single'; voiceId: string }
  | { mode: 'mix'; voiceIds: string[] };

export const DEFAULT_VOICE_SELECTION: VoiceSelection = { mode: 'single', voiceId: 'default' };

/** Deterministic 32-bit string hash (FNV-1a). Stable across runs and machines. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Resolve the concrete Google voice id for a single word, or `undefined` to use
 * Google's default voice. In mix mode, an empty `voiceIds` subset means "use all
 * available voices".
 */
export function resolveVoiceForText(
  text: string,
  selection: VoiceSelection,
  voiceOptions: string[],
): string | undefined {
  if (selection.mode === 'single') {
    return selection.voiceId === 'default' ? undefined : selection.voiceId;
  }
  const pool = selection.voiceIds.filter((voice) => voiceOptions.includes(voice));
  if (pool.length === 0) return undefined;
  // Sort so the assignment is independent of checkbox toggle order.
  const ordered = [...pool].sort();
  return ordered[hashString(text) % ordered.length];
}

/** Stable serialization used as an effect dependency / reset key. */
export function serializeVoiceSelection(selection: VoiceSelection): string {
  return selection.mode === 'single'
    ? `single:${selection.voiceId}`
    : `mix:${[...selection.voiceIds].sort().join(',')}`;
}

/** Short gender marker for a voice label, e.g. "♀" / "♂". Empty when unknown. */
export function genderMarker(gender: string | undefined): string {
  switch (gender?.toUpperCase()) {
    case 'FEMALE':
      return '♀';
    case 'MALE':
      return '♂';
    case 'NEUTRAL':
      return '⚲';
    default:
      return '';
  }
}

/** Human label for a voice in pickers, e.g. "cs-CZ-Wavenet-A ♀". */
export function formatVoiceLabel(
  voiceName: string,
  genders?: Record<string, string>,
): string {
  const marker = genderMarker(genders?.[voiceName]);
  return marker ? `${voiceName} ${marker}` : voiceName;
}

export function parseVoiceSelection(raw: string | null): VoiceSelection | null {
  if (!raw) return null;
  if (raw.startsWith('single:')) {
    return { mode: 'single', voiceId: raw.slice('single:'.length) || 'default' };
  }
  if (raw.startsWith('mix:')) {
    const ids = raw.slice('mix:'.length).split(',').map((id) => id.trim()).filter(Boolean);
    return { mode: 'mix', voiceIds: ids };
  }
  return null;
}
