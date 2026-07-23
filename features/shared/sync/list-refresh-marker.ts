const LIST_REFRESH_MARKER_KEY = 'get-word-refresh-lists-on-learning-return';
const LIST_REFRESH_MARKER_MAX_AGE_MS = 2 * 60 * 60_000;

export type ListsRefreshMarker = {
  listId: string | null;
  createdAt: number;
};

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function markListsChangedForLearningSync(listId: string | null): void {
  const target = storage();
  if (!target) return;
  try {
    target.setItem(
      LIST_REFRESH_MARKER_KEY,
      JSON.stringify({ listId, createdAt: Date.now() } satisfies ListsRefreshMarker),
    );
  } catch {
    // The next normal sync still reconciles this state; the marker only makes it immediate.
  }
}

export function consumeListsChangedForLearningSync(): ListsRefreshMarker | null {
  const target = storage();
  if (!target) return null;
  const raw = target.getItem(LIST_REFRESH_MARKER_KEY);
  if (!raw) return null;
  target.removeItem(LIST_REFRESH_MARKER_KEY);

  try {
    const parsed = JSON.parse(raw) as Partial<ListsRefreshMarker> | null;
    const createdAt = typeof parsed?.createdAt === 'number' ? parsed.createdAt : 0;
    if (!createdAt || Date.now() - createdAt > LIST_REFRESH_MARKER_MAX_AGE_MS) return null;
    const listId = typeof parsed?.listId === 'string' && parsed.listId.trim()
      ? parsed.listId
      : null;
    return { listId, createdAt };
  } catch {
    return null;
  }
}
