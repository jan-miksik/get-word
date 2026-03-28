// Client-side sync utilities
import { getDeviceId } from "./device-id";

// In-memory only: set from API responses, passed as hint to API. No localStorage.
let lastKnownUserId: string | null = null;

/** Clears in-memory user hint so subsequent syncs don't attach to the previous user. */
export function resetSyncIdentity(): void {
  lastKnownUserId = null;
}

/** API request shape for progress items. */
export interface SyncProgressItem {
  word_id?: string; // legacy: old word ID like "w000"
  word_list_item_id?: string; // new: UUID from word_list_items
  stage_index: number;
  known_count: number;
  unknown_count: number;
  last_known_at: number | null;
  last_unknown_at: number | null;
  next_due_at: number | null;
}

/** Word list item from the API (matches DB word_list_items table). */
export interface SyncWordListItem {
  id: string;
  listId: string;
  categoryId: string | null;
  position: number;
  textKnown: string;
  textTarget: string | null;
  translationStatus: string;
  audioAssetId: string | null;
  audioStatus: string;
  notes: string | null;
}

/** Category info returned alongside word_list_items. */
export interface SyncCategory {
  name: string;
  position: number;
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
    user_role?: "user" | "editor";
    show_english?: boolean;
    show_category_badges?: boolean;
    show_pronunciation?: boolean;
    wallet_address?: string | null;
    email?: string | null;
    auth_provider?: string | null;
    game_score?: number;
    category_order?: string[];
  };
  progress: Record<
    string,
    {
      id: string;
      userId: string;
      wordId: string | null;
      wordListItemId: string | null;
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
  word_list_items?: SyncWordListItem[];
  categories?: Record<string, SyncCategory>;
  lists?: { id: string; name: string }[];
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

/** Link a wallet (and optionally email/auth provider) to the current device user. */
export async function linkWallet(
  walletAddress: string,
  opts?: { email?: string | null; authProvider?: string | null }
): Promise<SyncResponse> {
  const deviceId = getDeviceId();

  const response = await fetch('/api/auth/link-wallet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      walletAddress,
      ...(opts?.email != null && { email: opts.email }),
      ...(opts?.authProvider != null && { authProvider: opts.authProvider }),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to link wallet: ${response.statusText}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Failed to link wallet: Unknown error');
  }
  if (result.user?.id) lastKnownUserId = result.user.id;
  return result;
}

// Sync data to server (DB-only; no localStorage).
export async function syncUserData(data: {
  role?: "cz" | "vi";
  show_english?: boolean;
  show_category_badges?: boolean;
  show_pronunciation?: boolean;
  game_score?: number;
  category_order?: string[];
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
    let errorMessage = `Failed to sync data: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = `Failed to sync data: ${errorData.error}`;
      }
    } catch {
      // Ignore JSON parse failures and keep status-based message
    }
    throw new Error(errorMessage);
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
const SYNC_DELAY = 2500; // 2.5 seconds

/** Clears any pending debounced sync so the next sync uses fresh state (e.g. after user switch). */
export function clearPendingSync(): void {
  if (syncTimeout !== null) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  latestData = null;
  if (resolvePending) {
    resolvePending();
    resolvePending = null;
    rejectPending = null;
    pendingPromise = null;
  }
}

function executeSync(): void {
  if (!latestData || !resolvePending || !rejectPending) return;

  // Capture locals and immediately reset module state so concurrent
  // calls to debouncedSync get a fresh promise instead of sharing these handlers.
  const data = latestData;
  const resolve = resolvePending;
  const reject = rejectPending;

  pendingPromise = null;
  resolvePending = null;
  rejectPending = null;
  syncTimeout = null;
  latestData = null;

  syncUserData(data)
    .then(() => resolve())
    .catch((error) => reject(error));
}

export function debouncedSync(
  data: Parameters<typeof syncUserData>[0]
): Promise<void> {
  // Merge into pending payload so we don't overwrite e.g. game_score when progress sync runs
  latestData = latestData ? { ...latestData, ...data } : data;

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
