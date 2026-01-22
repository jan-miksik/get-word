// Client-side sync utilities
import { getDeviceId } from "./device-id";

// In-memory only: set from API responses, passed as hint to API. No localStorage.
let lastKnownUserId: string | null = null;

/** API request shape for progress items. */
export interface SyncProgressItem {
  word_id: string;
  stage_index: number;
  known_count: number;
  unknown_count: number;
  last_known_at: number | null;
  last_unknown_at: number | null;
  next_due_at: number | null;
}

/** App-side progress shape (stageIndex, camelCase). Used by useAppState, WordCard, etc. */
export interface ProgressData {
  stageIndex: number;
  knownCount: number;
  unknownCount: number;
  lastKnownAt?: number;
  lastUnknownAt?: number;
  nextDueAt?: number;
}

export interface SyncResponse {
  success: boolean;
  user: {
    id: string;
    role: "cz" | "vi";
    show_english?: boolean;
    show_category_badges?: boolean;
  };
  progress: Record<
    string,
    {
      id: string;
      userId: string;
      wordId: string;
      stageIndex: number;
      knownCount: number;
      unknownCount: number;
      lastKnownAt: string | null;
      lastUnknownAt: string | null;
      nextDueAt: string | null;
      createdAt: string;
      updatedAt: string;
    }
  >;
  memory_hooks: Record<string, string>;
  category_filters: string[];
}

// Fetch data from server (DB-only; no localStorage).
export async function fetchUserData(): Promise<SyncResponse> {
  const deviceId = getDeviceId();
  const params = new URLSearchParams();
  if (deviceId) params.set('deviceId', deviceId);
  if (lastKnownUserId) params.set('userId', lastKnownUserId);

  try {
    const response = await fetch(`/api/sync?${params.toString()}`);

    if (!response.ok) {
      let errorMessage = `Failed to fetch user data: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = `Failed to fetch user data: ${errorData.error}`;
        }
      } catch {
        // If JSON parsing fails, use the status text
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch user data: Unknown error');
    }
    if (data.user?.id) lastKnownUserId = data.user.id;
    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to fetch user data: ${String(error)}`);
  }
}

// Sync data to server (DB-only; no localStorage).
export async function syncUserData(data: {
  role?: "cz" | "vi";
  show_english?: boolean;
  show_category_badges?: boolean;
  progress?: SyncProgressItem[];
  memory_hooks?: Record<string, string | null>;
  category_filters?: string[];
}): Promise<SyncResponse> {
  const deviceId = getDeviceId();

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId,
      userId: lastKnownUserId,
      ...data,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to sync data: ${response.statusText}`);
  }

  const result = await response.json();
  if (result.user?.id) lastKnownUserId = result.user.id;
  return result;
}

// Debounced sync helper
let syncTimeout: number | null = null;
let pendingPromise: Promise<void> | null = null;
let resolvePending: (() => void) | null = null;
let rejectPending: ((error: unknown) => void) | null = null;
let latestData: Parameters<typeof syncUserData>[0] | null = null;
const SYNC_DELAY = 1000; // 1 second

function executeSync(): void {
  if (latestData && resolvePending && rejectPending) {
    try {
      syncUserData(latestData)
        .then(() => {
          resolvePending!();
        })
        .catch((error) => {
          rejectPending!(error);
        })
        .finally(() => {
          pendingPromise = null;
          resolvePending = null;
          rejectPending = null;
          syncTimeout = null;
          latestData = null;
        });
    } catch (error) {
      rejectPending!(error);
      pendingPromise = null;
      resolvePending = null;
      rejectPending = null;
      syncTimeout = null;
      latestData = null;
    }
  }
}

export function debouncedSync(
  data: Parameters<typeof syncUserData>[0]
): Promise<void> {
  // Store the latest data to sync
  latestData = data;

  // If there's already a pending promise, return it (callers get the same promise)
  if (pendingPromise) {
    // Clear the existing timeout and recreate it with the latest data
    if (syncTimeout) {
      clearTimeout(syncTimeout);
    }

    // Recreate the timeout with the latest data
    syncTimeout = window.setTimeout(executeSync, SYNC_DELAY);

    return pendingPromise;
  }

  // Create a new promise and its resolve/reject handlers
  pendingPromise = new Promise<void>((resolve, reject) => {
    resolvePending = resolve;
    rejectPending = reject;
  });

  // Schedule the timeout
  syncTimeout = window.setTimeout(executeSync, SYNC_DELAY);

  return pendingPromise;
}
