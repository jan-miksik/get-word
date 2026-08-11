const LEARNING_LANGUAGE_PAIR_STORAGE_KEY = 'get-word-photo-lab-langs';
const PENDING_LEARNING_LANGUAGE_PAIR_STORAGE_KEY =
  'get-word-pending-learning-language-pair';

export type LearningLanguagePair = { from: string; to: string };
export type PendingLearningLanguagePair = LearningLanguagePair & {
  changedAt: string;
  baseRevision?: number;
};

/**
 * Fast local mirror of the server-owned learning pair.
 *
 * The key keeps its historical Photo Lab name for migration-free
 * compatibility. Chat, onboarding and Photo Lab now all treat the value as one
 * shared app preference.
 */
export function readLearningLanguagePair(): Partial<LearningLanguagePair> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LEARNING_LANGUAGE_PAIR_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<LearningLanguagePair>;
    return {
      from: typeof parsed.from === 'string' ? parsed.from : undefined,
      to: typeof parsed.to === 'string' ? parsed.to : undefined,
    };
  } catch {
    return {};
  }
}

export function storeLearningLanguagePair(pair: Partial<LearningLanguagePair>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LEARNING_LANGUAGE_PAIR_STORAGE_KEY, JSON.stringify(pair));
  } catch {
    // Preference persistence is best-effort; the server remains authoritative.
  }
}

export function readPendingLearningLanguagePair(): PendingLearningLanguagePair | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(
      PENDING_LEARNING_LANGUAGE_PAIR_STORAGE_KEY,
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingLearningLanguagePair>;
    if (
      typeof parsed.from !== 'string' ||
      typeof parsed.to !== 'string' ||
      typeof parsed.changedAt !== 'string'
    ) {
      return null;
    }
    return {
      from: parsed.from,
      to: parsed.to,
      changedAt: parsed.changedAt,
      ...(typeof parsed.baseRevision === 'number' ? { baseRevision: parsed.baseRevision } : {}),
    };
  } catch {
    return null;
  }
}

export function storePendingLearningLanguagePair(
  pair: PendingLearningLanguagePair,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PENDING_LEARNING_LANGUAGE_PAIR_STORAGE_KEY,
      JSON.stringify(pair),
    );
  } catch {
    // IndexedDB outbox remains the durable fallback when localStorage is full.
  }
}

export function clearPendingLearningLanguagePair(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(
      PENDING_LEARNING_LANGUAGE_PAIR_STORAGE_KEY,
    );
  } catch {
    // A matching server snapshot still confirms the preference in memory.
  }
}
