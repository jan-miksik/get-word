const PENDING_COMMON_LIST_AUDIO_KEY = 'get-word-pending-common-list-audio';
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type PendingCommonListAudio = {
  listId: string;
  languageFrom: string;
  languageTo: string;
  notice: string;
  createdAt: number;
};

function isPendingCommonListAudio(value: unknown): value is PendingCommonListAudio {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PendingCommonListAudio>;
  return (
    typeof candidate.listId === 'string' &&
    typeof candidate.languageFrom === 'string' &&
    typeof candidate.languageTo === 'string' &&
    typeof candidate.notice === 'string' &&
    typeof candidate.createdAt === 'number'
  );
}

export function savePendingCommonListAudio(
  pending: Omit<PendingCommonListAudio, 'createdAt'>,
) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      PENDING_COMMON_LIST_AUDIO_KEY,
      JSON.stringify({ ...pending, createdAt: Date.now() }),
    );
  } catch {
    // Best effort recovery hint only.
  }
}

export function clearPendingCommonListAudio(listId?: string) {
  if (typeof window === 'undefined') return;
  try {
    if (!listId) {
      localStorage.removeItem(PENDING_COMMON_LIST_AUDIO_KEY);
      return;
    }
    const pending = readPendingCommonListAudio();
    if (pending?.listId === listId) {
      localStorage.removeItem(PENDING_COMMON_LIST_AUDIO_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
}

export function readPendingCommonListAudio(): PendingCommonListAudio | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PENDING_COMMON_LIST_AUDIO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPendingCommonListAudio(parsed)) {
      localStorage.removeItem(PENDING_COMMON_LIST_AUDIO_KEY);
      return null;
    }
    if (Date.now() - parsed.createdAt > PENDING_MAX_AGE_MS) {
      localStorage.removeItem(PENDING_COMMON_LIST_AUDIO_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(PENDING_COMMON_LIST_AUDIO_KEY);
    return null;
  }
}
